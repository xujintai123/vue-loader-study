// import Basic from '../test/fixtures/basic.vue' 初次被vue-loader处理后的产物。

// 本次的产物会被webpack继续读取，然后.vue?vue会命中 pitcher loader
import { render, staticRenderFns } from './basic.vue?vue&type=template&id=49803768&'
import script from './basic.vue?vue&type=script&lang=js&'
export * from './basic.vue?vue&type=script&lang=js&'
import style1 from './basic.vue?vue&type=style&index=1&id=49803768&lang=css&'

/* normalize component */
import normalizer from '!../../lib/runtime/componentNormalizer.js'
var component = normalizer(
  script,
  render,
  staticRenderFns,
  false,
  null,
  null,
  null
) /* hot reload */
if (module.hot) {
  var api = require('/Users/xujintai/Desktop/play/vue相关/vue-loader/node_modules/.pnpm/vue-hot-reload-api@2.3.4/node_modules/vue-hot-reload-api/dist/index.js')
  api.install(require('vue'))
  if (api.compatible) {
    module.hot.accept()
    if (!api.isRecorded('49803768')) {
      api.createRecord('49803768', component.options)
    } else {
      api.reload('49803768', component.options)
    }
    module.hot.accept(
      './basic.vue?vue&type=template&id=49803768&',
      function () {
        api.rerender('49803768', {
          render: render,
          staticRenderFns: staticRenderFns
        })
      }
    )
  }
}

// component.options为组件option
component.options.__file = 'test/fixtures/basic.vue'
// component.exports为script的产物
export default component.exports
