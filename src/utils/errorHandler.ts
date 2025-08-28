// 全局错误处理工具
export class ErrorHandler {
  private static instance: ErrorHandler
  private errorCount = 0
  private readonly maxErrors = 10


  private constructor() {
    this.setupGlobalErrorHandlers()
  }

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler()
    }
    return ErrorHandler.instance
  }

  private setupGlobalErrorHandlers() {
    // 捕获未处理的Promise拒绝
    window.addEventListener('unhandledrejection', (event) => {
      console.error('未处理的Promise拒绝:', event.reason)
      this.handleError('unhandledrejection', event.reason)
      event.preventDefault()
    })

    // 捕获全局错误
    window.addEventListener('error', (event) => {
      console.error('全局错误:', event.error)
      this.handleError('error', event.error)
    })

    // 捕获资源加载错误
    window.addEventListener('error', (event) => {
      if (event.target !== window) {
        console.error('资源加载错误:', event.target)
        this.handleError('resource', new Error(`资源加载失败: ${(event.target as any).src || (event.target as any).href}`))
      }
    }, true)
  }

  private handleError(type: string, error: Error | any) {
    this.errorCount++

    // 如果错误过多，可能是页面出现了严重问题
    if (this.errorCount > this.maxErrors) {
      console.error('错误次数过多，建议刷新页面')
      this.showErrorNotification('页面出现严重错误，建议刷新页面')
      return
    }

    // 记录错误
    const errorInfo = {
      type,
      message: error?.message || String(error),
      stack: error?.stack,
      timestamp: new Date().toISOString(),
      url: window.location.href
    }

    console.error('错误详情:', errorInfo)

    // 如果是网络相关错误，显示友好提示
    if (this.isNetworkError(error)) {
      this.showErrorNotification('网络连接异常，请检查网络后重试')
    }
  }

  private isNetworkError(error: any): boolean {
    const networkErrorKeywords = [
      'network',
      'fetch',
      'timeout',
      'connection',
      'offline',
      'ERR_NETWORK',
      'ERR_INTERNET_DISCONNECTED'
    ]

    const errorMessage = String(error).toLowerCase()
    return networkErrorKeywords.some(keyword => errorMessage.includes(keyword))
  }

  private showErrorNotification(message: string) {
    // 创建通知元素
    const notification = document.createElement('div')
    notification.className = `
      fixed top-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50
      transform transition-transform duration-300 ease-in-out
    `
    notification.innerHTML = `
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
        </svg>
        <span>${message}</span>
        <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-white hover:text-gray-200">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
          </svg>
        </button>
      </div>
    `

    document.body.appendChild(notification)

    // 3秒后自动移除
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove()
      }
    }, 3000)
  }

  // 重置错误计数
  resetErrorCount() {
    this.errorCount = 0
  }

  // 获取当前错误计数
  getErrorCount(): number {
    return this.errorCount
  }
}

// 初始化全局错误处理
export const errorHandler = ErrorHandler.getInstance() 