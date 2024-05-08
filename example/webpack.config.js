const path = require('path')
const VueLoaderPlugin = require('../lib/plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  mode: 'development',
  entry: path.resolve(__dirname, './main.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    // publicPath: '/dist/' // 存放输出的静态资源的路径 https://www.yuque.com/xjt123/qf1uhq/pk40vk01b5nadn2w#o4eHi
    publicPath: '/' // 存放输出的静态资源的路径 https://www.yuque.com/xjt123/qf1uhq/pk40vk01b5nadn2w#o4eHi
  },
  devServer: {
    // static: {
    //   publicPath: '/'
    //   // publicPath: '/dist/' // devServer.static.publicPath 要和 output.publicPath一致
    // }
  },
  module: {
    rules: [
      // { loader: require.resolve('./debugger') },
      {
        test: /\.vue$/,
        use: [
          {
            loader: 'vue-loader'
          },
          // 补充测试用例 [测试多个 loader 匹配 .vue 的场景]
          {
            loader: 'match-vue-sfc-loader'
          }
        ]
      },
      // example to apply loader to a custom block without lang="xxx"
      // this rule applies to <foo> blocks
      {
        // resourceQuery: /blockType=foo/,
        test: /\.js$/, // 不使用resourceQuery，使用test的话 会走 clonedRule里的 fakeResourcePath匹配
        loader: 'babel-loader'
      },
      // example configuring preprocessor for <template lang="pug">
      {
        test: /\.pug$/,
        oneOf: [
          // this applies to <template lang="pug"> in Vue components
          {
            resourceQuery: /^\?vue/,
            use: ['pug-plain-loader']
          },
          // this applies to pug imports inside JavaScript
          {
            use: ['raw-loader', 'pug-plain-loader']
          }
        ]
      },
      // example configuring CSS Modules
      {
        test: /\.css$/,
        oneOf: [
          // this applies to <style module>
          {
            resourceQuery: /module/,
            use: [
              'vue-style-loader', // This is a fork based on style-loader. https://www.npmjs.com/package/vue-style-loader
              {
                loader: 'css-loader',
                options: {
                  modules: true,
                  localIdentName: '[local]_[hash:base64:8]'
                }
              }
            ]
          },
          // this applies to <style> or <style scoped>
          {
            use: [
              'vue-style-loader',
              'css-loader'
            ]
          }
        ]
      },
      // exmaple configration for <style lang="scss">
      {
        test: /\.less$/,
        use: [
          'vue-style-loader',
          'css-loader',
          {
            loader: require.resolve('less-loader')
            // global data for all components
            // this can be read from a scss file
          }
        ]
      }
    ]
  },
  resolveLoader: {
    alias: {
      'vue-loader': require.resolve('../lib'),
      'match-vue-sfc-loader': require.resolve('../lib/loaders/matchVueSfcLoader.js')
    }
  },
  plugins: [
    new VueLoaderPlugin(),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, './index.html')
    })
  ]
}
