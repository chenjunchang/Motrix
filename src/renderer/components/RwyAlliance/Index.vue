<template>
  <el-container class="main panel" direction="vertical">
    <el-header class="panel-header" height="84">
      <h4 class="rwy-title">{{ $t('menu.rwyAlliance') }}</h4>

      <div class="header-controls">
        <el-button
          :type="proxyStatusType"
          size="small"
          @click="toggleProxy"
          :loading="proxyLoading"
          class="proxy-btn"
        >
          <i :class="proxyStatusIcon"></i>
          {{ proxyStatusText }}
        </el-button>

        <el-button
          type="primary"
          size="small"
          :disabled="downloadFileList.length === 0"
          @click="toggleDrawer"
          class="download-btn"
        >
          <i class="el-icon-download"></i>
          下载 ({{ downloadFileList.length }})
        </el-button>
      </div>
    </el-header>

    <el-main class="panel-content rwy-content">
      <div v-if="rwyProxyStatus !== 'running'" class="proxy-setup">
        <el-card class="setup-card">
          <div slot="header">
            <span>代理设置</span>
          </div>
          <div class="setup-content">
            <p>请先启动浏览器以开始使用润物云联盟功能</p>
            <el-button type="primary" @click="toggleProxy" :loading="proxyLoading">
              启动浏览器
            </el-button>
          </div>
        </el-card>
      </div>

      <div v-else class="browser-container">
        <el-card class="browser-status-card">
          <div slot="header">
            <span>浏览器状态</span>
          </div>
          <div class="browser-status">
            <el-row :gutter="20">
              <el-col :span="12">
                <el-statistic title="浏览器状态" :value="rwyProxyStatus === 'running' ? '运行中' : '已停止'" />
              </el-col>
              <el-col :span="12">
                <el-statistic title="拦截数据" :value="downloadFileList.length" suffix="条" />
              </el-col>
            </el-row>
            <div class="browser-info">
              <p v-if="rwyProxyUrl">
                <i class="el-icon-link"></i>
                目标网站: {{ rwyProxyUrl }}
              </p>
              <p class="info-text">
                <i class="el-icon-info"></i>
                浏览器已在独立窗口中启动，请在浏览器中操作。系统会自动拦截相关数据。
              </p>
            </div>
          </div>
        </el-card>
      </div>
    </el-main>

    <!-- 下载抽屉 -->
    <download-drawer />
  </el-container>
</template>

<script>
  import DownloadDrawer from './DownloadDrawer'
  import { mapState } from 'vuex'

  export default {
    name: 'mo-rwy-alliance',
    components: {
      DownloadDrawer
    },
    data () {
      return {
        proxyLoading: false
      }
    },
    computed: {
    ...mapState('app', [
      'downloadFileList',
      'rwyProxyStatus',
      'rwyProxyPort',
      'rwyProxyUrl'
    ]),
    proxyStatusType () {
      switch (this.rwyProxyStatus) {
        case 'running': return 'success'
        case 'error': return 'danger'
        case 'starting':
        case 'stopping': return 'warning'
        default: return 'info'
      }
    },
    proxyStatusIcon () {
      switch (this.rwyProxyStatus) {
        case 'running': return 'el-icon-success'
        case 'error': return 'el-icon-error'
        case 'starting':
        case 'stopping': return 'el-icon-loading'
        default: return 'el-icon-video-play'
      }
    },
    proxyStatusText () {
      switch (this.rwyProxyStatus) {
        case 'running': return `代理运行中 :${this.rwyProxyPort}`
        case 'starting': return '启动中...'
        case 'stopping': return '停止中...'
        case 'error': return '代理错误'
        default: return '启动代理'
      }
    }
    },
    methods: {
      async toggleProxy () {
        if (this.rwyProxyStatus === 'stopped' || this.rwyProxyStatus === 'error') {
          await this.startProxy()
        } else if (this.rwyProxyStatus === 'running') {
          await this.stopProxy()
        }
      },

      async startProxy () {
        this.proxyLoading = true
        this.$store.dispatch('app/updateRwyProxyStatus', {
          status: 'starting',
          port: null,
          proxyUrl: ''
        })

        try {
          const result = await this.sendIpcMessage('start-rwy-proxy')

          if (result.success) {
            this.$store.dispatch('app/updateRwyProxyStatus', {
              status: 'running',
              port: null, // Puppeteer方案不使用端口
              proxyUrl: result.url || 'https://rwy.ywwl.com/lm/#/login'
            })
            this.$message.success(result.message || '浏览器启动成功')

            // 设置API拦截监听
            this.setupApiInterception()
          } else {
            throw new Error(result.error)
          }
        } catch (error) {
          this.$store.dispatch('app/updateRwyProxyStatus', {
            status: 'error',
            port: null,
            proxyUrl: ''
          })
          this.$message.error('启动浏览器失败: ' + error.message)
        } finally {
          this.proxyLoading = false
        }
      },

      async stopProxy () {
        this.proxyLoading = true
        this.$store.dispatch('app/updateRwyProxyStatus', {
          status: 'stopping',
          port: this.rwyProxyPort,
          proxyUrl: this.rwyProxyUrl
        })

        try {
          const result = await this.sendIpcMessage('stop-rwy-proxy')

          if (result.success) {
            this.$store.dispatch('app/updateRwyProxyStatus', {
              status: 'stopped',
              port: null,
              proxyUrl: ''
            })
            this.$message.success(result.message || '浏览器已关闭')

            // 移除API拦截监听
            this.removeApiInterception()

            // 清空文件列表
            this.$store.dispatch('app/clearDownloadFileList')
          } else {
            throw new Error(result.error)
          }
        } catch (error) {
          this.$store.dispatch('app/updateRwyProxyStatus', {
            status: 'error',
            port: this.rwyProxyPort,
            proxyUrl: this.rwyProxyUrl
          })
          this.$message.error('停止代理服务器失败: ' + error.message)
        } finally {
          this.proxyLoading = false
        }
      },

      sendIpcMessage (channel, data) {
        return new Promise((resolve, reject) => {
          const replyChannel = channel + 'ed'

          // 设置超时处理
          const timeout = setTimeout(() => {
            this.$electron.ipcRenderer.removeAllListeners(replyChannel)
            reject(new Error('请求超时'))
          }, 10000)

          this.$electron.ipcRenderer.once(replyChannel, (event, result) => {
            clearTimeout(timeout)
            resolve(result)
          })

          this.$electron.ipcRenderer.send(channel, data)
        })
      },

      setupApiInterception () {
        this.$electron.ipcRenderer.on('rwy-api-intercepted', this.handleApiIntercepted)
      },

      removeApiInterception () {
        this.$electron.ipcRenderer.removeAllListeners('rwy-api-intercepted')
      },

      handleApiIntercepted (event, data) {
        this.parseDownloadableFiles(data)
      },

      parseDownloadableFiles (responseData) {
        try {
          // Puppeteer方案中，数据结构为 { url, data, timestamp }
          // 其中 data 字段直接包含API响应数据
          const data = responseData.data || responseData.body || responseData

          if (data && data.success && data.data && data.data.records) {
            const fileList = data.data.records.map(record => ({
              id: record.id,
              name: record.descripet || `文件_${record.id}`,
              url: record.resourceUrl,
              thumbnail: record.imgUrl,
              size: record.mateSizeStr || '未知大小',
              sizeMB: record.mateSizeMB || 0,
              source: 'rwy'
            }))

            this.$store.dispatch('app/updateDownloadFileList', fileList)
            this.$message.success(`发现 ${fileList.length} 个可下载文件`)

            // 自动打开下载抽屉
            if (fileList.length > 0) {
              this.$store.dispatch('app/toggleDownloadDrawer', true)
            }
          }
        } catch (error) {
          console.error('解析下载文件失败:', error)
          this.$message.error('解析下载文件失败')
        }
      },

      toggleDrawer () {
        this.$store.dispatch('app/toggleDownloadDrawer', true)
      },

      async checkProxyStatus () {
        try {
          const result = await this.sendIpcMessage('get-rwy-proxy-status')
          if (result.isRunning) {
            this.$store.dispatch('app/updateRwyProxyStatus', {
              status: 'running',
              port: null, // Puppeteer方案不使用端口
              proxyUrl: result.url || 'https://rwy.ywwl.com/lm/#/login'
            })
            this.setupApiInterception()
          }
        } catch (error) {
          console.warn('检查代理状态失败:', error)
        }
      }
    },

    async mounted () {
      console.log('润物云联盟页面已加载')

      // 检查代理服务器状态
      await this.checkProxyStatus()
    },

    beforeDestroy () {
      console.log('润物云联盟页面即将销毁')

      // 清理资源
      this.removeApiInterception()
    }
  }
</script>

<style lang="scss" scoped>
.rwy-title {
  margin: 0;
  color: #333;
  font-size: 18px;
  font-weight: 500;
  line-height: 84px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid #ebeef5;
}

.header-controls {
  display: flex;
  gap: 8px;
}

.proxy-btn {
  min-width: 120px;
}

.rwy-content {
  padding: 0;
  height: calc(100vh - 84px);
  background: #f5f5f5;
}

.proxy-setup {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;

  .setup-card {
    width: 400px;
    text-align: center;

    .setup-content {
      padding: 20px;

      p {
        margin-bottom: 20px;
        color: #666;
        line-height: 1.6;
      }
    }
  }
}

.browser-container {
  height: 100%;
  padding: 20px;

  .browser-status-card {
    height: 100%;

    .browser-status {
      padding: 20px 0;

      .browser-info {
        margin-top: 20px;

        p {
          margin: 10px 0;
          color: #666;
          line-height: 1.6;

          i {
            margin-right: 8px;
            color: #409EFF;
          }
        }

        .info-text {
          background: #f0f9ff;
          border-left: 4px solid #409EFF;
          padding: 12px 16px;
          border-radius: 4px;
        }
      }
    }
  }
}
</style>
