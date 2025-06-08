<template>
  <el-drawer
    title="批量下载"
    :visible.sync="visible"
    direction="rtl"
    size="600px"
    :before-close="handleClose"
    class="download-drawer"
  >
    <div class="drawer-content">
      <!-- 头部操作栏 -->
      <div class="header-actions">
        <div class="file-count">
          已选择 {{ selectedCount }} / {{ totalCount }} 个文件
        </div>
        <div class="actions">
          <el-button size="small" @click="selectAll">
            {{ isAllSelected ? '取消全选' : '全选' }}
          </el-button>
          <el-button size="small" @click="clearList">
            清空列表
          </el-button>
          <el-button
            type="primary"
            size="small"
            :disabled="selectedCount === 0"
            @click="startBatchDownload"
            :loading="downloadLoading"
          >
            <i class="el-icon-download"></i>
            开始下载
          </el-button>
        </div>
      </div>

      <!-- 文件列表 -->
      <div class="file-list">
        <div
          v-for="file in downloadFileList"
          :key="file.id"
          class="file-item"
          :class="{ selected: isFileSelected(file.id) }"
          @click="toggleFileSelection(file.id)"
        >
          <div class="file-checkbox">
            <el-checkbox
              :value="isFileSelected(file.id)"
              @change="toggleFileSelection(file.id)"
              @click.stop
            />
          </div>

          <div class="file-thumbnail">
            <img
              v-if="file.thumbnail"
              :src="file.thumbnail"
              :alt="file.name"
              @error="handleImageError"
            >
            <div v-else class="placeholder-thumbnail">
              <i class="el-icon-document"></i>
            </div>
          </div>

          <div class="file-info">
            <div class="file-name" :title="file.name">
              {{ file.name }}
            </div>
            <div class="file-meta">
              <span class="file-size">{{ file.size }}</span>
              <span class="file-source">{{ file.source }}</span>
            </div>
          </div>

          <div class="file-actions">
            <el-button
              type="text"
              size="mini"
              @click.stop="downloadSingle(file)"
              :loading="file.downloading"
            >
              下载
            </el-button>
            <el-button
              type="text"
              size="mini"
              @click.stop="removeFile(file.id)"
              class="remove-btn"
            >
              移除
            </el-button>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="downloadFileList.length === 0" class="empty-state">
          <i class="el-icon-folder-opened"></i>
          <p>暂无可下载文件</p>
          <p class="empty-tip">使用润物云联盟浏览器访问目标页面以获取下载文件</p>
        </div>
      </div>

      <!-- 下载进度区域 -->
      <div v-if="downloadProgress.length > 0" class="progress-section">
        <div class="progress-header">
          <h4>下载进度</h4>
          <el-button size="mini" type="text" @click="clearProgress">
            清空记录
          </el-button>
        </div>
        <div class="progress-list">
          <div
            v-for="progress in downloadProgress"
            :key="progress.id"
            class="progress-item"
          >
            <div class="progress-info">
              <span class="progress-name">{{ progress.name }}</span>
              <span class="progress-status" :class="progress.status">
                {{ getStatusText(progress.status) }}
              </span>
            </div>
            <el-progress
              v-if="progress.status === 'downloading'"
              :percentage="progress.percentage"
              :stroke-width="4"
              status="success"
            />
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script>
  import { mapState } from 'vuex'
  import api from '@/api'

  export default {
    name: 'DownloadDrawer',
    data () {
      return {
        downloadLoading: false,
        downloadProgress: []
      }
    },
    computed: {
    ...mapState('app', [
      'downloadDrawerVisible',
      'downloadFileList',
      'selectedFileIds'
    ]),
    visible: {
      get () {
        return this.downloadDrawerVisible
      },
      set (value) {
        this.$store.dispatch('app/toggleDownloadDrawer', value)
      }
    },
    totalCount () {
      return this.downloadFileList.length
    },
    selectedCount () {
      return this.selectedFileIds.length
    },
    isAllSelected () {
      return this.totalCount > 0 && this.selectedCount === this.totalCount
    }
    },
    methods: {
      handleClose () {
        this.$store.dispatch('app/toggleDownloadDrawer', false)
      },

      isFileSelected (id) {
        return this.selectedFileIds.includes(id)
      },

      toggleFileSelection (id) {
        const currentIds = [...this.selectedFileIds]
        const index = currentIds.indexOf(id)

        if (index > -1) {
          currentIds.splice(index, 1)
        } else {
          currentIds.push(id)
        }

        this.$store.dispatch('app/updateSelectedFileIds', currentIds)
      },

      selectAll () {
        if (this.isAllSelected) {
          this.$store.dispatch('app/updateSelectedFileIds', [])
        } else {
          const allIds = this.downloadFileList.map(file => file.id)
          this.$store.dispatch('app/updateSelectedFileIds', allIds)
        }
      },

      clearList () {
        this.$store.dispatch('app/clearDownloadFileList')
      },

      removeFile (id) {
        const newList = this.downloadFileList.filter(file => file.id !== id)
        const newSelectedIds = this.selectedFileIds.filter(selectedId => selectedId !== id)

        this.$store.dispatch('app/updateDownloadFileList', newList)
        this.$store.dispatch('app/updateSelectedFileIds', newSelectedIds)
      },

      async startBatchDownload () {
        if (this.selectedCount === 0) {
          this.$message.warning('请选择要下载的文件')
          return
        }

        this.downloadLoading = true

        try {
          const selectedFiles = this.downloadFileList.filter(file =>
            this.selectedFileIds.includes(file.id)
          )

          for (const file of selectedFiles) {
            await this.downloadFile(file)
          }

          this.$message.success(`成功添加 ${selectedFiles.length} 个下载任务`)

          // 清空已下载的文件
          this.clearSelectedFiles()
        } catch (error) {
          console.error('批量下载失败:', error)
          this.$message.error('批量下载失败: ' + error.message)
        } finally {
          this.downloadLoading = false
        }
      },

      async downloadSingle (file) {
        try {
          this.$set(file, 'downloading', true)
          await this.downloadFile(file)
          this.$message.success(`已添加下载任务: ${file.name}`)

          // 从列表中移除已下载的文件
          this.removeFile(file.id)
        } catch (error) {
          console.error('下载失败:', error)
          this.$message.error('下载失败: ' + error.message)
        } finally {
          this.$set(file, 'downloading', false)
        }
      },

      async downloadFile (file) {
        // 添加下载进度记录
        const progressItem = {
          id: file.id,
          name: file.name,
          status: 'downloading',
          percentage: 0
        }
        this.downloadProgress.push(progressItem)

        try {
          // 调用Motrix API添加下载任务
          const downloadOptions = {
            uris: [file.url],
            options: {
              out: this.sanitizeFileName(file.name)
            }
          }

          const result = await api.addUri(downloadOptions)

          if (result) {
            progressItem.status = 'completed'
            progressItem.percentage = 100
          } else {
            throw new Error('添加下载任务失败')
          }
        } catch (error) {
          progressItem.status = 'failed'
          throw error
        }
      },

      sanitizeFileName (fileName) {
        // 清理文件名中的非法字符
        return fileName.replace(/[<>:"/\\|?*]/g, '_')
      },

      clearSelectedFiles () {
        const remainingFiles = this.downloadFileList.filter(file =>
          !this.selectedFileIds.includes(file.id)
        )

        this.$store.dispatch('app/updateDownloadFileList', remainingFiles)
        this.$store.dispatch('app/updateSelectedFileIds', [])
      },

      clearProgress () {
        this.downloadProgress = []
      },

      getStatusText (status) {
        const statusMap = {
          downloading: '下载中',
          completed: '已完成',
          failed: '失败'
        }
        return statusMap[status] || status
      },

      handleImageError (event) {
        // 图片加载失败时的处理
        event.target.style.display = 'none'
      }
    }
  }
</script>

<style lang="scss" scoped>
.download-drawer {
  .drawer-content {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .header-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #ebeef5;
    background: #f8f9fa;

    .file-count {
      font-size: 14px;
      color: #666;
    }

    .actions {
      display: flex;
      gap: 8px;
    }
  }

  .file-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .file-item {
    display: flex;
    align-items: center;
    padding: 12px;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    margin-bottom: 8px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background-color: #f5f7fa;
      border-color: #409eff;
    }

    &.selected {
      background-color: #ecf5ff;
      border-color: #409eff;
    }

    .file-checkbox {
      margin-right: 12px;
    }

    .file-thumbnail {
      width: 48px;
      height: 48px;
      margin-right: 12px;
      border-radius: 4px;
      overflow: hidden;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .placeholder-thumbnail {
        color: #999;
        font-size: 20px;
      }
    }

    .file-info {
      flex: 1;
      min-width: 0;

      .file-name {
        font-size: 14px;
        font-weight: 500;
        color: #303133;
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .file-meta {
        display: flex;
        gap: 12px;
        font-size: 12px;
        color: #909399;

        .file-source {
          text-transform: uppercase;
          background: #e4e7ed;
          padding: 2px 6px;
          border-radius: 2px;
        }
      }
    }

    .file-actions {
      display: flex;
      gap: 8px;

      .remove-btn {
        color: #f56c6c;
      }
    }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: #909399;

    i {
      font-size: 48px;
      margin-bottom: 16px;
    }

    p {
      margin: 4px 0;
    }

    .empty-tip {
      font-size: 12px;
      color: #c0c4cc;
    }
  }

  .progress-section {
    border-top: 1px solid #ebeef5;
    padding: 16px;
    background: #fafafa;

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;

      h4 {
        margin: 0;
        font-size: 14px;
        color: #303133;
      }
    }

    .progress-item {
      margin-bottom: 16px;

      .progress-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;

        .progress-name {
          font-size: 13px;
          color: #606266;
        }

        .progress-status {
          font-size: 12px;
          padding: 2px 6px;
          border-radius: 2px;

          &.downloading {
            background: #e1f3d8;
            color: #67c23a;
          }

          &.completed {
            background: #d1ecf1;
            color: #17a2b8;
          }

          &.failed {
            background: #fde2e2;
            color: #f56c6c;
          }
        }
      }
    }
  }
}
</style>
