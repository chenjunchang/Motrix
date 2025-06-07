<template>
  <div ref="webviewViewport" class="webview-viewport">
    <iframe
      class="mo-webview"
      ref="iframe"
      :src="src"
    ></iframe>
  </div>
</template>

<script>
  import is from 'electron-is'
  import { webContents } from '@electron/remote'
  import { Loading } from 'element-ui'

  export default {
    name: 'mo-browser',
    components: {
    },
    props: {
      src: {
        type: String,
        default: ''
      },
      enableRequestCapture: {
        type: Boolean,
        default: false
      }
    },
    data () {
      return {
        loading: null
      }
    },
    computed: {
      isRenderer: () => is.renderer()
    },
    mounted () {
      const { iframe } = this.$refs

      iframe.addEventListener('did-start-loading', this.loadStart.bind(this))
      iframe.addEventListener('did-stop-loading', this.loadStop.bind(this))
      iframe.addEventListener('dom-ready', this.ready.bind(this))

      // 新增：网络请求监听
      if (this.enableRequestCapture) {
        this.setupRequestInterception()
      }
    },
    methods: {
      loadStart () {
        const { webviewViewport } = this.$refs
        this.loading = Loading.service({
          target: webviewViewport
        })
      },
      loadStop () {
        this.$nextTick(() => {
          this.loading.close()
        })
      },
      ready () {
        const { iframe } = this.$refs

        const wc = webContents.fromId(iframe.getWebContentsId())
        wc.setWindowOpenHandler((event, url) => {
          event.preventDefault()
          this.$electron.ipcRenderer.send('command', 'application:open-external', url)
        })
      },

      setupRequestInterception () {
        this.$nextTick(() => {
          try {
            const { iframe } = this.$refs
            const wc = webContents.fromId(iframe.getWebContentsId())

            // 监听所有网络请求
            wc.session.webRequest.onBeforeRequest((details, callback) => {
              // 发射请求数据到父组件
              this.$emit('request-captured', {
                url: details.url,
                method: details.method,
                timestamp: Date.now(),
                headers: details.requestHeaders || {},
                resourceType: details.resourceType
              })
              callback()
            })

            // 监听响应
            wc.session.webRequest.onCompleted((details) => {
              this.$emit('response-captured', {
                url: details.url,
                statusCode: details.statusCode,
                responseHeaders: details.responseHeaders || {},
                timestamp: Date.now(),
                resourceType: details.resourceType
              })
            })

            console.log('网络请求监听已启用')
          } catch (error) {
            console.error('设置请求拦截失败:', error)
          }
        })
      }
    }
  }
</script>

<style lang="scss">
.webview-viewport {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.mo-webview {
  width: 100%;
  height: 100%;
  border: none;
  flex: 1;
}
</style>
