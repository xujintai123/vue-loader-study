const qs = require('querystring')
const loaderUtils = require('loader-utils')
const hash = require('hash-sum')
const selfPath = require.resolve('../index')
const templateLoaderPath = require.resolve('./templateLoader')
const stylePostLoaderPath = require.resolve('./stylePostLoader')
const { resolveCompiler } = require('../compiler')

const isESLintLoader = (l) => /(\/|\\|@)eslint-loader/.test(l.path)
const isNullLoader = (l) => /(\/|\\|@)null-loader/.test(l.path)
const isCSSLoader = (l) => /(\/|\\|@)css-loader/.test(l.path)
const isCacheLoader = (l) => /(\/|\\|@)cache-loader/.test(l.path)
const isPitcher = (l) => l.path !== __filename // xjt-question：这里的命名是不是有问题, 是不是应该叫做isNotPitcher
const isPreLoader = (l) => !l.pitchExecuted // loader未执行过pitch
const isPostLoader = (l) => l.pitchExecuted // loader已经执行过pitch

const dedupeESLintLoader = (loaders) => {
  const res = []
  let seen = false
  loaders.forEach((l) => {
    if (!isESLintLoader(l)) {
      res.push(l)
    } else if (!seen) {
      seen = true
      res.push(l)
    }
  })
  return res
}

const shouldIgnoreCustomBlock = (loaders) => {
  const actualLoaders = loaders.filter((loader) => {
    // vue-loader
    if (loader.path === selfPath) {
      return false
    }

    // cache-loader
    if (isCacheLoader(loader)) {
      return false
    }

    return true
  })
  return actualLoaders.length === 0
}

module.exports = (code) => code

// This pitching loader is responsible for intercepting all vue block requests
// and transform it into appropriate requests.
// remainingRequest的使用：https://zhuanlan.zhihu.com/p/104205895
module.exports.pitch = function (remainingRequest) {
  const options = loaderUtils.getOptions(this)
  const { cacheDirectory, cacheIdentifier } = options
  const query = qs.parse(this.resourceQuery.slice(1))

  // https://webpack.docschina.org/api/loaders/#thisloaders
  /* 当前的 import request 所匹配的所有loaders。可以在这打断点看运行后的结果 （type=style的 request 的 loaders 会包含 rules 配置中所有匹配到 request 的 rule） */
  let loaders = this.loaders

  // if this is a language block request, eslint-loader may get matched
  // multiple times
  // xjt-question：不太理解这里的处理是针对什么场景
  if (query.type) {
    // if this is an inline block, since the whole file itself is being linted,
    // remove eslint-loader to avoid duplicate linting.
    if (/\.vue$/.test(this.resourcePath)) {
      loaders = loaders.filter((l) => !isESLintLoader(l))
    } else {
      // This is a src import. Just make sure there's not more than 1 instance
      // of eslint present.
      loaders = dedupeESLintLoader(loaders)
    }
  }

  // remove self
  loaders = loaders.filter(isPitcher)

  // do not inject if user uses null-loader to void the type (#1239)
  if (loaders.some(isNullLoader)) {
    return
  }

  const genRequest = (loaders) => {
    // Important: dedupe since both the original rule
    // and the cloned rule would match a source import request.
    // also make sure to dedupe based on loader path.
    // assumes you'd probably never want to apply the same loader on the same
    // file twice.
    // Exception: in Vue CLI we do need two instances of postcss-loader
    // for user config and inline minification. So we need to dedupe baesd on
    // path AND query to be safe.
    const seen = new Map()
    const loaderStrings = []

    loaders.forEach((loader) => {
      const identifier =
        typeof loader === 'string' ? loader : loader.path + loader.query
      const request = typeof loader === 'string' ? loader : loader.request
      if (!seen.has(identifier)) {
        seen.set(identifier, true)
        // loader.request contains both the resolved loader path and its options
        // query (e.g. ??ref-0)
        loaderStrings.push(request)
      }
    })

    return loaderUtils.stringifyRequest(
      this,
      '-!' +
        [...loaderStrings, this.resourcePath + this.resourceQuery].join('!')
    )
  }

  // Inject style-post-loader before css-loader for scoped CSS and trimming
  if (query.type === `style`) {
    const cssLoaderIndex = loaders.findIndex(isCSSLoader)
    if (cssLoaderIndex > -1) {
      const afterLoaders = loaders.slice(0, cssLoaderIndex + 1)
      const beforeLoaders = loaders.slice(cssLoaderIndex + 1)
      const request = genRequest([
        ...afterLoaders,
        stylePostLoaderPath,
        ...beforeLoaders
      ])
      // console.log(request)
      return query.module
        ? `export { default } from  ${request}; export * from ${request}`
        : `export * from ${request}`
    }
  }

  // for templates: inject the template compiler & optional cache
  if (query.type === `template`) {
    const path = require('path')
    const cacheLoader =
      cacheDirectory && cacheIdentifier
        ? [
            `${require.resolve('cache-loader')}?${JSON.stringify({
              // For some reason, webpack fails to generate consistent hash if we
              // use absolute paths here, even though the path is only used in a
              // comment. For now we have to ensure cacheDirectory is a relative path.
              cacheDirectory: (path.isAbsolute(cacheDirectory)
                ? path.relative(process.cwd(), cacheDirectory)
                : cacheDirectory
              ).replace(/\\/g, '/'),
              cacheIdentifier: hash(cacheIdentifier) + '-vue-loader-template'
            })}`
          ]
        : []

    // preLoaders：pitcher阶段的执行顺序在当前的pitcher loader之后的loader，也就是normal阶段执行顺序在当前的pitcher loader之前的loader
    // postLoaders：其pitcher loader顺序在当前的pitcher loader之前的loader
    // 注意：pitcher loader和 normal loader的顺序是相反的，pitcher loader相对靠前就说明normal loader相对靠后
    const preLoaders = loaders.filter(isPreLoader)
    const postLoaders = loaders.filter(isPostLoader)
    const { is27 } = resolveCompiler(this.rootContext, this)

    // xjt-question：这里塞入postLoaders和preLoaders是干嘛的？
    // xjt-guess：因为要塞入templateLoader， 那么就要找塞入的位置。保证normal阶段 templateLoader 的执行顺序是当前的pitcher loader的顺序位置
    // 注意：request中loader的执行顺序是从后往前的
    const request = genRequest([
      ...cacheLoader,
      ...postLoaders,
      ...(is27 ? [] : [templateLoaderPath + `??vue-loader-options`]),
      ...preLoaders
    ])

    // the template compiler uses esm exports
    return `export * from ${request}`
  }

  // if a custom block has no other matching loader other than vue-loader itself
  // or cache-loader, we should ignore it
  if (query.type === `custom` && shouldIgnoreCustomBlock(loaders)) {
    return ``
  }

  // When the user defines a rule that has only resourceQuery but no test,
  // both that rule and the cloned rule will match, resulting in duplicated
  // loaders. Therefore it is necessary to perform a dedupe here.
  const request = genRequest(loaders)
  return `import mod from ${request}; export default mod; export * from ${request}`
}
