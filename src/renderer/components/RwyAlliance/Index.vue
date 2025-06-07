<template>
  <el-container
    class="main panel"
    direction="vertical"
  >
    <el-header
      class="panel-header"
      height="84"
    >
      <h4 class="rwy-title">{{ $t('menu.rwyAlliance') }}</h4>
    </el-header>
    <el-main class="panel-content rwy-content">
      <mo-browser
        ref="rwyBrowser"
        :src="rwyUrl"
        :enableRequestCapture="true"
        @request-captured="handleRequestData"
        @response-captured="handleResponseData"
        class="rwy-browser"
      />
    </el-main>
  </el-container>
</template>

<script>
  import Browser from '@/components/Browser'

  export default {
    name: 'mo-rwy-alliance',
    components: {
      [Browser.name]: Browser
    },
    data () {
      return {
        rwyUrl: 'https://rwy.ywwl.com/lm/#/',
        capturedRequests: [],
        capturedResponses: []
      }
    },
    methods: {
      handleRequestData (requestData) {
        // 处理捕获的请求数据
        console.log('捕获的请求数据:', requestData)
        this.capturedRequests.push(requestData)

        // 可以在这里实现数据存储、处理等逻辑
        this.$store.dispatch('app/addCapturedRequest', requestData)
      },

      handleResponseData (responseData) {
        // 处理捕获的响应数据
        console.log('捕获的响应数据:', responseData)
        this.capturedResponses.push(responseData)

        // 可以在这里实现数据存储、处理等逻辑
        this.$store.dispatch('app/addCapturedResponse', responseData)
      }
    },

    mounted () {
      // 组件挂载时的初始化逻辑
      console.log('润物云联盟页面已加载')
    },

    beforeDestroy () {
      // 组件销毁前的清理逻辑
      console.log('润物云联盟页面即将销毁')
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

.rwy-content {
  padding: 0;
  height: calc(100vh - 84px);
}

.rwy-browser {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 0;
  overflow: hidden;
}
</style>
