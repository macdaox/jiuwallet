import { useState, useCallback, useEffect } from 'react'
import { Activity, RefreshCw, Wifi, AlertTriangle } from 'lucide-react'
import { useWalletStore } from '../store/useWalletStore'
import { blockchainService } from '../utils/blockchain'
import { validateContractAddress } from '../utils/contractValidation'
import { networkDiagnostics } from '../utils/networkDiagnostics'
import { ethers } from 'ethers'

interface StatusBarProps {
  onRefresh?: () => void
  isRefreshing?: boolean
  showRescueMode?: boolean
}

export function StatusBar({ 
  onRefresh, 
  isRefreshing = false, 
  showRescueMode = true 
}: StatusBarProps) {
  const { config, addLog, setConfig } = useWalletStore()
  
  const [networkStatus, setNetworkStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking')
  const [isCheckingNetwork, setIsCheckingNetwork] = useState(false)
  const [contractValidationStatus, setContractValidationStatus] = useState<{
    isValid: boolean
    contractType: string
    name: string
    symbol: string
    decimals: number
    address: string
    error?: string
  } | null>(null)
  const [isCheckingContractStatus, setIsCheckingContractStatus] = useState(false)
  const [isDiagnosing, setIsDiagnosing] = useState(false)
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null)

  // 执行网络诊断
  const performNetworkDiagnostics = useCallback(async () => {
    setIsDiagnosing(true)
    setDiagnosticResult(null)
    
    try {
      const result = await networkDiagnostics.performDiagnostics()
      const report = networkDiagnostics.getDiagnosticReport(result)
      setDiagnosticResult(report)
      
      addLog({
        level: result.overallStatus === 'healthy' ? 'success' : 'error',
        category: 'system',
        message: '网络诊断完成',
        details: report
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '诊断失败'
      setDiagnosticResult(`诊断失败: ${errorMessage}`)
      
      addLog({
        level: 'error',
        category: 'system',
        message: '网络诊断失败',
        details: errorMessage
      })
    } finally {
      setIsDiagnosing(false)
    }
  }, [addLog])

  // 检测网络连接
  const checkNetworkStatus = useCallback(async () => {
    setIsCheckingNetwork(true)
    setNetworkStatus('checking')
    
    try {
      // 使用RPC优化器进行网络检测
      const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com')
      const blockNumber = await provider.getBlockNumber()
      
      if (blockNumber > 0) {
        setNetworkStatus('connected')
        addLog({
          level: 'success',
          category: 'system',
          message: '网络连接正常',
          details: `当前区块: ${blockNumber}`
        })
      } else {
        setNetworkStatus('disconnected')
        addLog({
          level: 'error',
          category: 'system',
          message: '网络连接异常',
          details: '无法获取区块信息'
        })
      }
    } catch (error) {
      setNetworkStatus('disconnected')
      const errorMessage = error instanceof Error ? error.message : '网络检测失败'
      
      // 更详细的错误信息
      let detailedMessage = '网络连接失败'
      if (errorMessage.includes('timeout')) {
        detailedMessage = '网络请求超时，请检查网络连接'
      } else if (errorMessage.includes('fetch')) {
        detailedMessage = '网络请求失败，可能是网络连接问题'
      } else if (errorMessage.includes('CORS')) {
        detailedMessage = '跨域请求被阻止，请检查浏览器设置'
      } else {
        detailedMessage = `网络连接失败: ${errorMessage}`
      }
      
      addLog({
        level: 'error',
        category: 'system',
        message: '网络连接失败',
        details: detailedMessage
      })
    } finally {
      setIsCheckingNetwork(false)
    }
  }, [addLog])

  // 检查合约验证状态
  const checkContractValidationStatus = useCallback(async () => {
    setIsCheckingContractStatus(true)
    
    try {
      // 获取provider
      const provider = blockchainService.getProvider()
      
      // 检测配置页面设置的代币合约地址
      const tokenAddress = config.tokenAddress
      
      if (!tokenAddress) {
        setContractValidationStatus({
          isValid: false,
          contractType: 'ERC20',
          name: '未配置',
          symbol: 'N/A',
          decimals: 18,
          address: '',
          error: '未配置代币合约地址'
        })
        
        addLog({
          level: 'warning',
          category: 'system',
          message: '代币合约地址未配置',
          details: '请在配置页面设置代币合约地址'
        })
        return
      }
      
      const result = await validateContractAddress(tokenAddress, provider)
      
      if (result.isValid) {
        setContractValidationStatus({
          isValid: true,
          contractType: result.contractType || 'ERC20',
          name: result.name || 'Unknown',
          symbol: result.symbol || 'Unknown',
          decimals: result.decimals || 18,
          address: tokenAddress
        })
        
        addLog({
          level: 'success',
          category: 'system',
          message: '代币合约验证成功',
          details: `${result.name} (${result.symbol}) - ${result.contractType}`
        })
      } else {
        setContractValidationStatus({
          isValid: false,
          contractType: 'ERC20',
          name: 'Unknown',
          symbol: 'Unknown',
          decimals: 18,
          address: tokenAddress,
          error: result.error || '代币合约验证失败'
        })
        
        addLog({
          level: 'error',
          category: 'system',
          message: '代币合约验证状态检查失败',
          details: result.error || '代币合约已失效'
        })
      }
    } catch (error) {
      setContractValidationStatus({
        isValid: false,
        contractType: 'ERC20',
        name: 'Unknown',
        symbol: 'Unknown',
        decimals: 18,
        address: config.tokenAddress || '',
        error: error instanceof Error ? error.message : '代币合约验证失败'
      })
      
      addLog({
        level: 'error',
        category: 'system',
        message: '代币合约验证检查失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    } finally {
      setIsCheckingContractStatus(false)
    }
  }, [addLog, config.tokenAddress])

  // 初始化时检查网络状态
  useEffect(() => {
    checkNetworkStatus()
  }, [])

  // 初始化时检查DAI合约状态
  useEffect(() => {
    checkContractValidationStatus()
  }, [])

  return (
    <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0 whitespace-nowrap">
      {/* 网络状态指示器 */}
      <div className="flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-gray-100">
        <div className={`w-3 h-3 rounded-full ${
          networkStatus === 'connected' ? 'bg-green-500' :
          networkStatus === 'disconnected' ? 'bg-red-500' :
          'bg-yellow-500 animate-pulse'
        }`} />
        <span className="text-gray-700 font-medium">
          {networkStatus === 'connected' ? '网络正常' :
           networkStatus === 'disconnected' ? '网络断开' :
           '检查中...'}
        </span>
        {networkStatus === 'disconnected' && (
          <button
            onClick={checkNetworkStatus}
            disabled={isCheckingNetwork}
            className="text-sm text-blue-600 hover:text-blue-800 underline disabled:opacity-50 font-medium"
          >
            {isCheckingNetwork ? '重试中...' : '重试'}
          </button>
        )}
      </div>
      
      {/* 疯狂抢救模式切换按钮 */}
      {showRescueMode && config.autoTransfer && (
        <button
          onClick={() => setConfig({ rescueMode: !config.rescueMode })}
          className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
            config.rescueMode 
              ? 'bg-red-600 text-white hover:bg-red-700' 
              : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          {config.rescueMode ? '🚨 抢救模式' : '⚡ 普通模式'}
        </button>
      )}
      
      {/* 合约验证状态按钮 */}
      <div className="flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-gray-100">
        <div className={`w-3 h-3 rounded-full ${
          contractValidationStatus?.isValid ? 'bg-green-500' : 
          contractValidationStatus && !contractValidationStatus.isValid ? 'bg-red-500' : 'bg-yellow-500'
        }`} />
        <span className="text-gray-700 font-medium">
          {contractValidationStatus?.isValid ? '代币合约已验证' : 
           contractValidationStatus && !contractValidationStatus.isValid ? '代币合约无效' : '代币合约未验证'}
        </span>
        <button
          onClick={checkContractValidationStatus}
          disabled={isCheckingContractStatus}
          className="text-sm text-blue-600 hover:text-blue-800 underline disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {isCheckingContractStatus ? '检查中...' : '检查'}
        </button>
      </div>
      
      {/* 网络诊断按钮 */}
      <button
        onClick={performNetworkDiagnostics}
        disabled={isDiagnosing}
        className="flex items-center gap-2 px-3 py-2 text-sm bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        title="执行详细的网络诊断"
      >
        <Wifi className={`w-4 h-4 ${isDiagnosing ? 'animate-spin' : ''}`} />
        {isDiagnosing ? '诊断中...' : '网络诊断'}
      </button>
      
      {/* 刷新按钮 */}
      <button
        onClick={onRefresh}
        disabled={isRefreshing || networkStatus === 'disconnected'}
        className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
      >
        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        刷新
      </button>
      
      {/* 诊断结果显示 */}
      {diagnosticResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">网络诊断报告</h3>
              <button
                onClick={() => setDiagnosticResult(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <AlertTriangle className="w-5 h-5" />
              </button>
            </div>
            <pre className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded border">
              {diagnosticResult}
            </pre>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setDiagnosticResult(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 