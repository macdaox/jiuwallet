import { useState, useEffect } from 'react'
import { useWalletStore } from '../store/useWalletStore'
import { DataBackup } from '../utils/dataBackup'
import { 
  Download, 
  Upload, 
  Save, 
  RefreshCw, 
  Trash2, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  Shield
} from 'lucide-react'

export function DataPage() {
  const { config, transferRecords, logs } = useWalletStore()
  const [backupInfo, setBackupInfo] = useState<{ exists: boolean; timestamp?: string }>({ exists: false })
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    setBackupInfo(DataBackup.getBackupInfo())
  }, [])

  const handleExportBackup = async () => {
    try {
      setIsExporting(true)
      setMessage(null)
      
      const backupData = {
        config: {
          ...config,
          privateKey: '' // 不导出私钥
        },
        transferRecords,
        logs: logs.slice(0, 100)
      }
      
      DataBackup.createBackup(backupData)
      DataBackup.exportBackup()
      
      setMessage({ type: 'success', text: '备份文件已导出' })
      setBackupInfo(DataBackup.getBackupInfo())
    } catch (error) {
      setMessage({ type: 'error', text: `导出失败: ${error instanceof Error ? error.message : '未知错误'}` })
    } finally {
      setIsExporting(false)
    }
  }

  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setIsImporting(true)
      setMessage(null)
      
      await DataBackup.importBackup(file)
      
      setMessage({ type: 'success', text: '备份文件已导入' })
      setBackupInfo(DataBackup.getBackupInfo())
    } catch (error) {
      setMessage({ type: 'error', text: `导入失败: ${error instanceof Error ? error.message : '未知错误'}` })
    } finally {
      setIsImporting(false)
      event.target.value = ''
    }
  }

  const handleCreateBackup = () => {
    try {
      setMessage(null)
      
      const backupData = {
        config: {
          ...config,
          privateKey: '' // 不备份私钥
        },
        transferRecords,
        logs: logs.slice(0, 100)
      }
      
      DataBackup.createBackup(backupData)
      setMessage({ type: 'success', text: '本地备份已创建' })
      setBackupInfo(DataBackup.getBackupInfo())
    } catch (error) {
      setMessage({ type: 'error', text: `备份失败: ${error instanceof Error ? error.message : '未知错误'}` })
    }
  }

  const handleClearBackup = () => {
    if (confirm('确定要清除所有备份数据吗？此操作不可恢复。')) {
      try {
        DataBackup.clearBackup()
        setMessage({ type: 'success', text: '备份数据已清除' })
        setBackupInfo(DataBackup.getBackupInfo())
      } catch (error) {
        setMessage({ type: 'error', text: `清除失败: ${error instanceof Error ? error.message : '未知错误'}` })
      }
    }
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('zh-CN')
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-3 mb-6">
          <Database className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">数据管理</h1>
        </div>

        {/* 状态信息 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-blue-900">备份状态</span>
            </div>
            <div className="flex items-center gap-2">
              {backupInfo.exists ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
              )}
              <span className="text-sm text-blue-700">
                {backupInfo.exists ? '已备份' : '未备份'}
              </span>
            </div>
            {backupInfo.timestamp && (
              <div className="flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3 text-blue-500" />
                <span className="text-xs text-blue-600">
                  {formatTimestamp(backupInfo.timestamp)}
                </span>
              </div>
            )}
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-5 h-5 text-green-600" />
              <span className="font-medium text-green-900">转账记录</span>
            </div>
            <span className="text-2xl font-bold text-green-700">{transferRecords.length}</span>
            <span className="text-sm text-green-600 ml-1">条记录</span>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-5 h-5 text-purple-600" />
              <span className="font-medium text-purple-900">系统日志</span>
            </div>
            <span className="text-2xl font-bold text-purple-700">{logs.length}</span>
            <span className="text-sm text-purple-600 ml-1">条日志</span>
          </div>
        </div>

        {/* 消息提示 */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-800' :
            message.type === 'error' ? 'bg-red-50 text-red-800' :
            'bg-blue-50 text-blue-800'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' && <CheckCircle className="w-5 h-5" />}
              {message.type === 'error' && <AlertTriangle className="w-5 h-5" />}
              {message.type === 'info' && <Clock className="w-5 h-5" />}
              <span>{message.text}</span>
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <button
            onClick={handleCreateBackup}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Save className="w-5 h-5" />
            <span>创建备份</span>
          </button>

          <button
            onClick={handleExportBackup}
            disabled={isExporting || !backupInfo.exists}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-5 h-5" />
            <span>{isExporting ? '导出中...' : '导出备份'}</span>
          </button>

          <label className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors cursor-pointer">
            <Upload className="w-5 h-5" />
            <span>{isImporting ? '导入中...' : '导入备份'}</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              className="hidden"
              disabled={isImporting}
            />
          </label>

          <button
            onClick={handleClearBackup}
            disabled={!backupInfo.exists}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-5 h-5" />
            <span>清除备份</span>
          </button>
        </div>

        {/* 安全提示 */}
        <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-yellow-900 mb-2">安全提示</h4>
              <ul className="text-sm text-yellow-800 space-y-1">
                <li>• 备份文件包含敏感信息，请妥善保管</li>
                <li>• 私钥不会包含在备份文件中，需要单独导入</li>
                <li>• 建议定期创建备份，避免数据丢失</li>
                <li>• 请使用固定端口 5180 访问应用，确保数据一致性</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 