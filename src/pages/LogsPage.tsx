import { useState, useMemo } from 'react'
import { Filter, Trash2, Download, Info, CheckCircle, AlertTriangle, FileText, XCircle } from 'lucide-react'
import { useWalletStore } from '../store/useWalletStore'
import type { LogEntry } from '../store/useWalletStore'

export function LogsPage() {
  const { logs, clearLogs } = useWalletStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterLevel, setFilterLevel] = useState('all')


  // 过滤和搜索日志
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = searchTerm === '' || 
        log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.details && log.details.toLowerCase().includes(searchTerm.toLowerCase()))
      
      const matchesLevel = filterLevel === 'all' || log.level === filterLevel
      
      return matchesSearch && matchesLevel
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [logs, searchTerm, filterLevel])

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'info': return <Info className="w-4 h-4" />
      case 'warning': return <AlertTriangle className="w-4 h-4" />
      case 'error': return <XCircle className="w-4 h-4" />
      case 'success': return <CheckCircle className="w-4 h-4" />
      default: return <Info className="w-4 h-4" />
    }
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'info': return 'text-blue-600 bg-blue-50'
      case 'warning': return 'text-yellow-600 bg-yellow-50'
      case 'error': return 'text-red-600 bg-red-50'
      case 'success': return 'text-green-600 bg-green-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  // 移除未使用的函数



  // 清空日志
  const handleClearLogs = () => {
    if (window.confirm('确定要清空所有日志吗？此操作不可撤销。')) {
      clearLogs()
    }
  }

  // 安全的时间格式化函数
  const formatTimestamp = (timestamp: any) => {
    try {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
      if (isNaN(date.getTime())) {
        return '无效时间'
      }
      return date.toLocaleString('zh-CN')
    } catch (error) {
      console.error('时间格式化错误:', error)
      return '时间错误'
    }
  }

  // 导出日志
  const handleExportLogs = () => {
    const logData = filteredLogs.map(log => ({
      timestamp: formatTimestamp(log.timestamp),
      level: log.level,
      message: log.message,
      details: log.details || ''
    }))
    
    const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wallet-logs-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center">
            <FileText className="w-6 h-6 mr-2 text-primary-600" />
            系统日志
          </h2>
          <div className="flex items-center gap-3">
            {/* 导出按钮 */}
            <button
              onClick={handleExportLogs}
              disabled={filteredLogs.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              导出日志
            </button>

            {/* 清空按钮 */}
            <button
              onClick={handleClearLogs}
              disabled={logs.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              清空日志
            </button>
          </div>
        </div>

        {/* 过滤器 */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="flex items-center mb-4">
            <Filter className="w-5 h-5 mr-2 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">过滤选项</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                日志级别
              </label>
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="all">全部</option>
                <option value="info">信息</option>
                <option value="success">成功</option>
                <option value="warning">警告</option>
                <option value="error">错误</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                搜索
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索日志内容..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* 日志列表 */}
        <div className="space-y-3">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">暂无日志记录</p>
            </div>
          ) : (
            filteredLogs.map((log: LogEntry) => (
              <div key={log.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors duration-200">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className={`p-2 rounded-full ${getLevelColor(log.level)}`}>
                      {getLevelIcon(log.level)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-sm text-gray-500">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 mb-1">
                        {log.message}
                      </p>
                      {log.details && (
                        <p className="text-sm text-gray-600">
                          {log.details}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 统计信息 */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {logs.filter(log => log.level === 'info').length}
              </p>
              <p className="text-sm text-gray-600">信息</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">
                {logs.filter(log => log.level === 'success').length}
              </p>
              <p className="text-sm text-gray-600">成功</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-600">
                {logs.filter(log => log.level === 'warning').length}
              </p>
              <p className="text-sm text-gray-600">警告</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">
                {logs.filter(log => log.level === 'error').length}
              </p>
              <p className="text-sm text-gray-600">错误</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}