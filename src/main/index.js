import { app } from 'electron'
import is from 'electron-is'
import { initialize } from '@electron/remote/main'
import fetch from 'node-fetch'

import Launcher from './Launcher'

// 添加fetch polyfill到全局对象
if (!global.fetch) {
  global.fetch = fetch
}

/**
 * initialize the main-process side of the remote module
 */
initialize()

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'

if (process.env.NODE_ENV !== 'development') {
  global.__static = require('path').join(__dirname, '/static').replace(/\\/g, '\\\\')
}

/**
 * Fix Windows notification func
 * appId defined in .electron-vue/webpack.main.config.js
 */
if (is.windows()) {
  app.setAppUserModelId(appId)
}

global.launcher = new Launcher()
