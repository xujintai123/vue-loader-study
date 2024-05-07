const { resolveCompiler } = require('./compiler')

const qs = require('querystring')
const id = 'vue-loader-plugin'
const NS = 'vue-loader'
const BasicEffectRulePlugin = require('webpack/lib/rules/BasicEffectRulePlugin')
const BasicMatcherRulePlugin = require('webpack/lib/rules/BasicMatcherRulePlugin')
const RuleSetCompiler = require('webpack/lib/rules/RuleSetCompiler')
const UseEffectRulePlugin = require('webpack/lib/rules/UseEffectRulePlugin')

const objectMatcherRulePlugins = []
try {
  const ObjectMatcherRulePlugin = require('webpack/lib/rules/ObjectMatcherRulePlugin')
  objectMatcherRulePlugins.push(
    new ObjectMatcherRulePlugin('assert', 'assertions'),
    new ObjectMatcherRulePlugin('descriptionData')
  )
} catch (e) {
  const DescriptionDataMatcherRulePlugin = require('webpack/lib/rules/DescriptionDataMatcherRulePlugin')
  objectMatcherRulePlugins.push(new DescriptionDataMatcherRulePlugin())
}

const ruleSetCompiler = new RuleSetCompiler([
  new BasicMatcherRulePlugin('test', 'resource'),
  new BasicMatcherRulePlugin('mimetype'),
  new BasicMatcherRulePlugin('dependency'),
  new BasicMatcherRulePlugin('include', 'resource'),
  new BasicMatcherRulePlugin('exclude', 'resource', true),
  new BasicMatcherRulePlugin('conditions'),
  new BasicMatcherRulePlugin('resource'),
  new BasicMatcherRulePlugin('resourceQuery'),
  new BasicMatcherRulePlugin('resourceFragment'),
  new BasicMatcherRulePlugin('realResource'),
  new BasicMatcherRulePlugin('issuer'),
  new BasicMatcherRulePlugin('compiler'),
  ...objectMatcherRulePlugins,
  new BasicEffectRulePlugin('type'),
  new BasicEffectRulePlugin('sideEffects'),
  new BasicEffectRulePlugin('parser'),
  new BasicEffectRulePlugin('resolve'),
  new BasicEffectRulePlugin('generator'),
  new UseEffectRulePlugin()
])

class VueLoaderPlugin {
  apply(compiler) {
    // debugger
    const normalModule = compiler.webpack
      ? compiler.webpack.NormalModule
      : require('webpack/lib/NormalModule')
    // add NS marker so that the loader can detect and report missing plugin
    // 通过tap注册事件（调用时机为compilation），
    compiler.hooks.compilation.tap(id, (compilation) => {
      const normalModuleLoader =
        normalModule.getCompilationHooks(compilation).loader
      // xjt-question：这里是干嘛的 没理解？
      normalModuleLoader.tap(id, (loaderContext) => {
        loaderContext[NS] = true
      })
    })

    const rules = compiler.options.module.rules
    let rawVueRule
    let vueRules = []

    for (const rawRule of rules) {
      // skip rules with 'enforce'. eg. rule for eslint-loader
      if (rawRule.enforce) {
        continue
      }
      vueRules = match(rawRule, 'foo.vue')
      if (!vueRules.length) {
        vueRules = match(rawRule, 'foo.vue.html')
      }
      if (vueRules.length > 0) {
        if (rawRule.oneOf) {
          throw new Error(
            `[VueLoaderPlugin Error] vue-loader 15 currently does not support vue rules with oneOf.`
          )
        }

        // xjt-question：寻找应用到.vue文件的rule（rawVueRule只会记录最新的值，如果配置了多个怎么办?)
        /*  例如：[{
          test: /\.vue$/,
          loader: 'vue-loader'
        },
        {
          test: /\.vue$/,
          loader: 'xx-loader'
        }]） */
        rawVueRule = rawRule
        break
      }
    }
    if (!vueRules.length) {
      throw new Error(
        `[VueLoaderPlugin Error] No matching rule for .vue files found.\n` +
          `Make sure there is at least one root-level rule that matches .vue or .vue.html files.`
      )
    }

    // get the normalized "use" for vue files
    const vueUse = vueRules
      .filter((rule) => rule.type === 'use')
      .map((rule) => rule.value)

    // get vue-loader options
    // 查找Vueloader的index
    const vueLoaderUseIndex = vueUse.findIndex((u) => {
      return /^vue-loader|(\/|\\|@)vue-loader/.test(u.loader)
    })

    if (vueLoaderUseIndex < 0) {
      throw new Error(
        `[VueLoaderPlugin Error] No matching use for vue-loader is found.\n` +
          `Make sure the rule matching .vue files include vue-loader in its use.`
      )
    }

    // make sure vue-loader options has a known ident so that we can share
    // options by reference in the template-loader by using a ref query like
    // template-loader??vue-loader-options
    const vueLoaderUse = vueUse[vueLoaderUseIndex]
    vueLoaderUse.ident = 'vue-loader-options'
    vueLoaderUse.options = vueLoaderUse.options || {}

    // for each user rule (expect the vue rule), create a cloned rule
    // that targets the corresponding language blocks in *.vue files.
    const refs = new Map()
    const clonedRules = rules
      .filter((r) => r !== rawVueRule)
      .map((rawRule) =>
        cloneRule(rawRule, refs, langBlockRuleCheck, langBlockRuleResource)
      )

    // fix conflict with config.loader and config.options when using config.use
    delete rawVueRule.loader
    delete rawVueRule.options
    rawVueRule.use = vueUse

    // rule for template compiler
    // 增加templateLoader，匹配规则为 .vue?type=template
    const templateCompilerRule = {
      loader: require.resolve('./loaders/templateLoader'),
      resourceQuery: (query) => {
        if (!query) {
          return false
        }
        const parsed = qs.parse(query.slice(1))
        return parsed.vue != null && parsed.type === 'template'
      },
      options: vueLoaderUse.options
    }

    // for each rule that matches plain .js files, also create a clone and
    // match it against the compiled template code inside *.vue files, so that
    // compiled vue render functions receive the same treatment as user code
    // (mostly babel)
    // 支持vue 2.7
    const { is27 } = resolveCompiler(compiler.options.context)
    let jsRulesForRenderFn = []
    if (is27) {
      jsRulesForRenderFn = rules
        .filter(
          (r) =>
            r !== rawVueRule &&
            (match(r, 'test.js').length > 0 || match(r, 'test.ts').length > 0)
        )
        .map((rawRule) => cloneRule(rawRule, refs, jsRuleCheck, jsRuleResource))
    }

    // global pitcher (responsible for injecting template compiler loader & CSS
    // post loader)
    // 增加pitcherLoader，匹配规则为 url上带有key为vue的query（xxx?vue）
    const pitcher = {
      loader: require.resolve('./loaders/pitcher'),
      resourceQuery: (query) => {
        if (!query) {
          return false
        }
        const parsed = qs.parse(query.slice(1))
        return parsed.vue != null
      },
      options: {
        cacheDirectory: vueLoaderUse.options.cacheDirectory,
        cacheIdentifier: vueLoaderUse.options.cacheIdentifier
      }
    }

    // replace original rules
    compiler.options.module.rules = [
      pitcher,
      ...jsRulesForRenderFn,
      ...(is27 ? [templateCompilerRule] : []),
      ...clonedRules,
      ...rules
    ]
  }
}

const matcherCache = new WeakMap()

function match(rule, fakeFile) {
  let ruleSet = matcherCache.get(rule)
  if (!ruleSet) {
    // skip the `include` check when locating the vue rule
    const clonedRawRule = { ...rule }
    delete clonedRawRule.include

    ruleSet = ruleSetCompiler.compile([clonedRawRule])
    matcherCache.set(rule, ruleSet)
  }

  return ruleSet.exec({
    resource: fakeFile
  })
}

const langBlockRuleCheck = (query, rule) => {
  return (
    query.type === 'custom' || !rule.conditions.length || query.lang != null
  )
}

const langBlockRuleResource = (query, resource) => `${resource}.${query.lang}`

const jsRuleCheck = (query) => {
  return query.type === 'template'
}

const jsRuleResource = (query, resource) =>
  `${resource}.${query.ts ? `ts` : `js`}`

let uid = 0

function cloneRule(rawRule, refs, ruleCheck, ruleResource) {
  // RuleSetCompiler作用：https://juejin.cn/post/7205208559263514680#heading-3
  const compiledRule = ruleSetCompiler.compileRule(
    `clonedRuleSet-${++uid}`,
    rawRule,
    refs
  )

  // do not process rule with enforce
  if (!rawRule.enforce) {
    const ruleUse = compiledRule.effects
      .filter((effect) => effect.type === 'use')
      .map((effect) => effect.value)
    // fix conflict with config.loader and config.options when using config.use
    delete rawRule.loader
    delete rawRule.options
    rawRule.use = ruleUse
  }

  let currentResource
  // 为clone的rule增加resource和resourceQuery
  const res = {
    ...rawRule,
    resource: (resources) => {
      // 资源文件的绝对路径 https://webpack.docschina.org/configuration/module/#rule-conditions
      currentResource = resources
      return true
    },
    resourceQuery: (query) => {
      if (!query) {
        return false
      }

      const parsed = qs.parse(query.slice(1))
      // 1.clone 的规则只对vue的sfc生效(sfc的request的query中包含 ?vue)
      if (parsed.vue == null) {
        return false
      }
      if (!ruleCheck(parsed, compiledRule)) {
        return false
      }
      // fakeResourcePath => `${currentResource}.${parsed.lang}`
      // 使用 parsed.lang 构建一个 文件类型结尾，例如当前的 request 是 'xxx?lang=less', 就转换为fakeResourcePath：'xxx?lang=less.less'
      const fakeResourcePath = ruleResource(parsed, currentResource)
      for (const condition of compiledRule.conditions) {
        // add support for resourceQuery
        // 如果用户使用 resourceQuery 作为匹配规则，那就传入query，否则就传入 currentResource，这时候尝试使用 fakeResourcePath 来替代 currentResource。
        const request =
          condition.property === 'resourceQuery' ? query : fakeResourcePath
        if (condition && !condition.fn(request)) {
          return false
        }
      }
      return true
    }
  }

  // 由于在resourceQuery中已经使用compiledRule转化了原规则的test，因此可以删除 原规则的test
  delete res.test

  if (rawRule.rules) {
    res.rules = rawRule.rules.map((rule) =>
      cloneRule(rule, refs, ruleCheck, ruleResource)
    )
  }

  if (rawRule.oneOf) {
    res.oneOf = rawRule.oneOf.map((rule) =>
      cloneRule(rule, refs, ruleCheck, ruleResource)
    )
  }

  return res
}

VueLoaderPlugin.NS = NS
module.exports = VueLoaderPlugin
