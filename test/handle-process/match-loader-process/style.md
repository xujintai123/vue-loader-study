### 0. demo
在 main.js 使用 import Basic from '../test/fixtures/basic.vue' （注意：本文只说明 style 在当前的 webpack.config.js 配置下的转换过程）

### 1. webpack 处理 'import Basic from '../test/fixtures/basic.vue' 匹配 vue-loader（.vue）。
第一次经过 vue-loader 的产物为：import style1 from './basic.vue?vue&type=style&index=1&id=49803768&lang=css&' （第一次经过 vue-loader 的产物是个固定模版）


### 2. 由于步骤一里的产物含有 import 语句，webpack 会分析依赖，然后再去递归这些依赖。然后匹配到pitch-loader（?vue）、vue-loader（.vue）。
目标：将 import request 匹配到的 loader 以 inline loader 形式注入到 import request。（注意：这里的 this.loaders 还会包含 cloned rules 中匹配的内容）
对于 style，pitch-loader 为其增加 自定义loader stylePostLoader 的处理（处理scoped），
pitch-loader 的返回值为：
'-!../../node_modules/.pnpm/vue-style-loader@4.1.3/node_modules/vue-style-loader/index.js!../../node_modules/.pnpm/css-loader@1.0.1_webpack@5.73.0/node_modules/css-loader/index.js!../../lib/loaders/stylePostLoader.js!../../node_modules/.pnpm/less-loader@8.1.1_less@4.2.0_webpack@5.73.0/node_modules/less-loader/dist/cjs.js!../../lib/index.js??vue-loader-options!./basic.vue?vue&type=style&index=1&id=49803768&lang=less&'

由于 pitch-loader 的返回值不为 undefined，所以触发了熔断机制。
注意这次的产物为 inline-request（从左到右依次为 [vue-style-loader, css-loader, stylePostLoader, less-loader, vue-loader]），inline-request 带有'-!'前缀，目的是防止 query 中的.vue?vue匹配 rules 里的 pitch-loader（?vue）、vue-loader（.vue），这样会陷入循环。


### 3. webpack 继续分析 步骤二里生成产物（inline request） 依次经过[vue-style-loader, css-loader, stylePostLoader, less-loader, vue-loader]。
由于此时 query 带有 type=style 所以进入 vue-loader 的selectBlock 方法。
在 selectBlock 中返回 descriptor.styles[query.index].content，然后走后面的 loader。
