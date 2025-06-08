import puppeteer from 'puppeteer'
import { EventEmitter } from 'events'
import path from 'path'
import { app } from 'electron'

export class PuppeteerBrowser extends EventEmitter {
  constructor (options = {}) {
    super()
    this.browser = null
    this.page = null
    this.targetUrl = options.targetUrl || 'https://rwy.ywwl.com/lm/#/login'
    this.isRunning = false
    this.interceptedData = []
  }

  getChromePath () {
    const fs = require('fs')

    // 在开发环境中，使用bundled chrome
    if (process.env.NODE_ENV === 'development') {
      return null // 让puppeteer自动查找
    }

    console.log('[Puppeteer] 检查打包环境Chrome路径...')

    // 在打包环境中，尝试多种路径
    const appPath = app.getAppPath()
    const resourcesPath = process.resourcesPath

    console.log('[Puppeteer] App路径:', appPath)
    console.log('[Puppeteer] Resources路径:', resourcesPath)

    // 优先查找打包后的Chrome和用户缓存中的Chrome
    const os = require('os')
    const chromiumBasePaths = [
      // 打包后的路径
      path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'puppeteer', '.local-chromium'),
      path.join(appPath, 'node_modules', 'puppeteer', '.local-chromium'),
      // 用户缓存中的Chrome路径
      path.join(os.homedir(), '.cache', 'puppeteer', 'chrome')
    ]

    for (const basePath of chromiumBasePaths) {
      console.log('[Puppeteer] 检查路径:', basePath)
      if (fs.existsSync(basePath)) {
        console.log('[Puppeteer] 找到.local-chromium目录:', basePath)

        try {
          // 读取目录内容，查找版本目录
          const entries = fs.readdirSync(basePath)
          console.log('[Puppeteer] 目录内容:', entries)

          let platformPrefix, chromeSubPaths
          if (process.platform === 'win32') {
            platformPrefix = 'win64-'
            chromeSubPaths = [
              path.join('chrome-win64', 'chrome.exe'), // 新版本路径
              path.join('chrome-win', 'chrome.exe') // 旧版本路径
            ]
          } else if (process.platform === 'darwin') {
            platformPrefix = 'mac-'
            chromeSubPaths = [
              path.join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
            ]
          } else {
            platformPrefix = 'linux-'
            chromeSubPaths = [
              path.join('chrome-linux', 'chrome')
            ]
          }

          for (const entry of entries) {
            if (entry.startsWith(platformPrefix)) {
              for (const chromeSubPath of chromeSubPaths) {
                const chromePath = path.join(basePath, entry, chromeSubPath)
                console.log('[Puppeteer] 检查Chrome路径:', chromePath)
                if (fs.existsSync(chromePath)) {
                  console.log('[Puppeteer] 找到Chrome可执行文件:', chromePath)
                  return chromePath
                }
              }
            }
          }
        } catch (error) {
          console.log('[Puppeteer] 读取目录出错:', error.message)
        }
      }
    }

    // 如果找不到打包的Chrome，尝试系统Chrome
    const systemPaths = []
    if (process.platform === 'win32') {
      systemPaths.push(
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
      )
    } else if (process.platform === 'darwin') {
      systemPaths.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    } else {
      systemPaths.push(
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser'
      )
    }

    for (const chromePath of systemPaths) {
      if (fs.existsSync(chromePath)) {
        console.log('[Puppeteer] 找到系统Chrome:', chromePath)
        return chromePath
      }
    }

    console.log('[Puppeteer] 未找到Chrome，使用系统默认')
    return null
  }

  async start () {
    try {
      console.log('[Puppeteer] 启动浏览器...')

      // 获取Chrome执行路径
      const chromePath = this.getChromePath()
      console.log('[Puppeteer] Chrome路径:', chromePath)

      // 启动Puppeteer浏览器
      this.browser = await puppeteer.launch({
        headless: false, // 显示浏览器窗口，便于用户操作
        executablePath: chromePath, // 指定Chrome可执行文件路径
        defaultViewport: { width: 1200, height: 800 },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--disable-gpu-sandbox'
        ]
      })

      // 创建新页面
      this.page = await this.browser.newPage()

      // 设置用户代理
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

      // 启用请求拦截
      await this.page.setRequestInterception(true)

      // 监听所有请求
      this.page.on('request', (request) => {
        console.log(`[Puppeteer] 请求: ${request.method()} ${request.url()}`)
        // 继续请求
        request.continue()
      })

      // 监听所有响应 - 这里是关键的API拦截逻辑
      this.page.on('response', async (response) => {
        const url = response.url()
        const status = response.status()

        console.log(`[Puppeteer] 响应: ${status} ${url}`)

        // 检查是否为目标API
        if (url.includes('pageQueryByProductIdAndTypeAndIpId')) {
          try {
            console.log('[Puppeteer] 检测到目标API调用，正在拦截数据...')

            const contentType = response.headers()['content-type']
            if (contentType && contentType.includes('application/json')) {
              const data = await response.json()

              console.log('[Puppeteer] 成功拦截API数据:', {
                url,
                dataLength: JSON.stringify(data).length,
                timestamp: new Date().toISOString()
              })

              // 存储拦截的数据
              const interceptedItem = {
                url,
                method: 'GET', // 通常这个API是GET请求
                status,
                data,
                timestamp: Date.now()
              }

              this.interceptedData.push(interceptedItem)

              // 发送事件到主进程
              this.emit('api-intercepted', interceptedItem)
            }
          } catch (error) {
            console.error('[Puppeteer] 解析API响应失败:', error.message)
          }
        }
      })

      // 监听页面错误
      this.page.on('pageerror', (error) => {
        console.error('[Puppeteer] 页面错误:', error.message)
      })

      // 监听控制台消息
      this.page.on('console', (msg) => {
        console.log(`[Puppeteer] 页面控制台: ${msg.text()}`)
      })

      // 导航到目标网站
      console.log(`[Puppeteer] 正在导航到: ${this.targetUrl}`)
      await this.page.goto(this.targetUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      })

      this.isRunning = true
      console.log('[Puppeteer] 浏览器启动成功，可以开始操作')

      return {
        success: true,
        message: '浏览器启动成功',
        url: this.targetUrl
      }
    } catch (error) {
      console.error('[Puppeteer] 启动失败:', error.message)
      await this.stop()
      throw error
    }
  }

  async stop () {
    try {
      console.log('[Puppeteer] 正在关闭浏览器...')

      if (this.page) {
        await this.page.close()
        this.page = null
      }

      if (this.browser) {
        await this.browser.close()
        this.browser = null
      }

      this.isRunning = false
      this.interceptedData = []

      console.log('[Puppeteer] 浏览器已关闭')

      return {
        success: true,
        message: '浏览器已关闭'
      }
    } catch (error) {
      console.error('[Puppeteer] 关闭失败:', error.message)
      throw error
    }
  }

  getStatus () {
    return {
      isRunning: this.isRunning,
      url: this.targetUrl,
      interceptedCount: this.interceptedData.length,
      browserConnected: this.browser && this.browser.isConnected(),
      pageUrl: this.page ? this.page.url() : null
    }
  }

  getInterceptedData () {
    return this.interceptedData
  }

  clearInterceptedData () {
    this.interceptedData = []
    return { success: true, message: '已清空拦截数据' }
  }

  // 获取当前页面的URL（用户可能已经导航到其他页面）
  async getCurrentUrl () {
    if (this.page) {
      return this.page.url()
    }
    return null
  }

  // 在页面中执行JavaScript代码
  async evaluateScript (script) {
    if (this.page) {
      try {
        const result = await this.page.evaluate(script)
        return { success: true, result }
      } catch (error) {
        return { success: false, error: error.message }
      }
    }
    return { success: false, error: '浏览器未启动' }
  }

  // 等待特定元素出现
  async waitForSelector (selector, timeout = 10000) {
    if (this.page) {
      try {
        await this.page.waitForSelector(selector, { timeout })
        return { success: true }
      } catch (error) {
        return { success: false, error: error.message }
      }
    }
    return { success: false, error: '浏览器未启动' }
  }
}

export default PuppeteerBrowser
