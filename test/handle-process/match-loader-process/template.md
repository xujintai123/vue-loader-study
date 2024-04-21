### 0. demo
在 main.js 使用 import Basic from '../test/fixtures/basic.vue' （注意：本文只说明 template 在当前的 webpack.config.js 配置下的转换过程）

### 1. webpack 处理 'import Basic from '../test/fixtures/basic.vue' 匹配 vue-loader（.vue）。
第一次经过 vue-loader 的产物为：import { render, staticRenderFns } from './basic.vue?vue&type=template&id=49803768&'


### 2. 由于步骤一里的产物含有 import 语句，webpack 会分析依赖，然后再去递归这些依赖。然后匹配到pitch-loader（?vue）、vue-loader（.vue）。
目标：将 import request 匹配到的 loader 以 inline loader 形式注入到 import request。（注意：这里的 this.loaders 还会包含 cloned rules 中匹配的内容）
对于 template，pitch-loader 为其增加 templateLoader 的处理，
pitch-loader 的返回值为：
export * from "-!../../lib/loaders/templateLoader.js??vue-loader-options!../../lib/index.js??vue-loader-options!./basic.vue?vue&type=template&id=49803768&", 
由于 pitch-loader 的返回值不为 undefined，所以触发了熔断机制。
注意这次的产物为 inline-request（其中包括 vue-loader 和templateLoader），inline-request 带有'-!'前缀，目的是防止 query 中的.vue?vue匹配 rules 里的 pitch-loader（?vue）、vue-loader（.vue），这样会陷入循环。


### 3. webpack 继续分析 步骤二里生成产物（inline request） 依次经过vue-loader、templateLoader。
由于此时 query 带有 type=template， 所以进入 vue-loader 的selectBlock 方法。
在 selectBlock 中返回 descriptor.template.content，然后走后面的 templateLoader loader。
templateLoader loader 将 descriptor.template.content 通过 vue-template-compiler 转换为 render 函数然后返回。
自此，sfc 中的 template 就成功转换为 render 函数并返回。
