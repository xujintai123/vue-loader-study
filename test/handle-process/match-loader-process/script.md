### 0. demo
在main.js使用 import Basic from '../test/fixtures/basic.vue' （注意：本文只说明 script 部分在当前的 webpack.config.js 配置下的转换过程）

### 1. webpack 处理 'import Basic from '../test/fixtures/basic.vue' 匹配 vue-loader（.vue）。
第一次经过 vue-loader 的产物为：
- import script from './basic.vue?vue&type=script&lang=js&
- export * from './basic.vue?vue&type=script&lang=js&

### 2. 由于步骤一里的产物是 import 语句，webpack 会分析依赖，然后再去递归这些依赖。然后匹配pitch-loader（?vue）、vue-loader（.vue）。
目标：将 import request 匹配到的 loader 以 inline loader 形式注入到 import request。（注意：这里的 this.loaders 还会包含 cloned rules 中匹配的内容）
对于 script ，pitch-loader 通过 this.loaders 结合 loaderUtils.stringifyRequest，以 inline loader 形式注入到 import request。
pitch-loader 的返回值为：
- import mod from "-!../../lib/index.js??vue-loader-options!./basic.vue?vue&type=script&lang=js&"; 
- export default mod; 
- export * from "-!../../lib/index.js??vue-loader-options!./basic.vue?vue&type=script&lang=js&";

### 3. webpack 继续分析 步骤二里生成产物（inline request） 经过vue-loader。
由于此时 query 带有 type=script ， 所以进入 vue-loader 的selectBlock 方法。
在 selectBlock 中返回 descriptor.script.content：
- "export default {  data () {  return {  msg: 'Hello from Component A!' }  }}"