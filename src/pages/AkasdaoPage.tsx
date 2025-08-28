import { useState, useEffect } from 'react'
import { useWalletStore } from '../store/useWalletStore'
import { AkasaDAOService } from '../utils/akasdao'
import { TOKEN_ADDRESSES } from '../utils/tokens'
import { blockchainService } from '../utils/blockchain'
import { getPrivateKey, hasStoredPrivateKey } from '../utils/encryption'
import { StatusBar } from '../components/StatusBar'
import { 
  Play, 
  Square, 
  Settings, 
  Wallet, 
  Coins, 
  Zap, 
  Clock, 
  AlertCircle,
  XCircle,
  RefreshCw,
  Maximize2,
  Loader2,
  Bug,
  TrendingUp,
  TrendingDown,
  Trash2,
  Download,
  Calendar
} from 'lucide-react'
import { ethers } from 'ethers'
import { AKASDAO_CONFIG } from '../utils/akasdao'

export function AkasdaoPage() {
  const { 
    config, 
    walletStatus, 
    addLog, 
    setError, 
    error,
    addTransferRecord
  } = useWalletStore()
  
  const [akasdaoService] = useState(() => new AkasaDAOService(blockchainService.getProvider()))
  const [daiBalance, setDaiBalance] = useState('0')
  const [turbineAddress, setTurbineAddress] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)
  
  // 自动模式状态
  const [autoModeRunning, setAutoModeRunning] = useState(false)
  const [autoModeInterval, setAutoModeInterval] = useState<NodeJS.Timeout | null>(null)
  const [lastAutoCheck, setLastAutoCheck] = useState<Date | null>(null)
  const [autoModeStats, setAutoModeStats] = useState({
    totalTransactions: 0,
    totalDaiUsed: '0',
    lastTransactionTime: null as Date | null
  })
  
  // 手动模式状态
  const [manualAmount, setManualAmount] = useState('')
  const [isManualProcessing, setIsManualProcessing] = useState(false)

  // 调试状态
  const [isDebugging, setIsDebugging] = useState(false)

  // 历史记录状态
  const [historyRecords, setHistoryRecords] = useState<Array<{
    id: string
    timestamp: Date
    daiAmount: string
    gasUsed: string
    gasPrice: string
    status: 'success' | 'failed'
    txHash?: string
    errorMessage?: string
  }>>([])


  // 初始化服务
  useEffect(() => {
    const initService = async () => {
      try {
        // 获取私钥并初始化钱包
        let privateKey: string | null = config.privateKey
        if (!privateKey && hasStoredPrivateKey()) {
          privateKey = getPrivateKey()
        }
        
        if (!privateKey) {
          throw new Error('未找到私钥，请先在配置页面导入钱包')
        }
        
        await akasdaoService.initializeWallet(privateKey)
        setIsInitialized(true)
        
        // 获取初始数据
        const balance = await akasdaoService.getTokenBalance(TOKEN_ADDRESSES.DAI)
        setDaiBalance(balance)
        
        setTurbineAddress('0x43208F448dE982a2d8a2dF8F8E78574b98f2aA74')
        
        addLog({
          level: 'info',
          category: 'service',
          message: 'AkasaDAO服务初始化成功',
          details: `DAI余额: ${balance}, Turbine地址: 0x43208F448dE982a2d8a2dF8F8E78574b98f2aA74`
        })
      } catch (error) {
        console.error('AkasaDAO服务初始化失败:', error)
        setError(`AkasaDAO初始化失败: ${error instanceof Error ? error.message : '未知错误'}`)
        addLog({
          level: 'error',
          category: 'service',
          message: 'AkasaDAO服务初始化失败',
          details: error instanceof Error ? error.message : '未知错误'
        })
      }
    }

    if (walletStatus?.address) {
      initService()
    }
  }, [walletStatus?.address, akasdaoService, addLog, setError, config.privateKey])

  // 定期更新余额
  useEffect(() => {
    const updateBalance = async () => {
      if (isInitialized && walletStatus?.address) {
        try {
          const balance = await akasdaoService.getTokenBalance(TOKEN_ADDRESSES.DAI)
          setDaiBalance(balance)
        } catch (error) {
          console.error('更新DAI余额失败:', error)
        }
      }
    }

    const interval = setInterval(updateBalance, 10000) // 每10秒更新一次
    return () => clearInterval(interval)
  }, [isInitialized, walletStatus?.address, akasdaoService])

  // 自动模式检查函数
  const checkAndAutoSilence = async () => {
    try {
      // 先检查钱包状态
      if (!walletStatus?.address) {
        addLog({
          level: 'error',
          category: 'auto',
          message: '钱包未连接，跳过自动silence',
          details: '请先连接钱包'
        })
        return
      }

      // 检查网络连接
      try {
        await akasdaoService.getProvider().getNetwork()
      } catch (error) {
        addLog({
          level: 'error',
          category: 'auto',
          message: '网络连接失败，跳过自动silence',
          details: '请检查网络连接'
        })
        return
      }

      const balance = await akasdaoService.getTokenBalance(TOKEN_ADDRESSES.DAI)
      setDaiBalance(balance)
      
      const balanceNum = parseFloat(balance)
      if (balanceNum > 0.001) { // 最小0.001 DAI才执行
        addLog({
          level: 'info',
          category: 'auto',
          message: '检测到DAI余额，开始自动silence',
          details: `当前DAI余额: ${balance}, 使用${config.rescueMode ? '抢救' : '普通'}模式`
        })
        
        // 使用当前余额进行silence，传递gas配置
        const gasConfig = {
          gasLimit: config.gasLimit,
          gasStrategy: config.gasStrategy,
          gasMultiplier: config.gasMultiplier,
          rescueMode: config.rescueMode,
          rescueGasMultiplier: config.rescueGasMultiplier
        }
        
        // 添加详细的调试信息
        addLog({
          level: 'info',
          category: 'auto',
          message: 'Gas配置详情',
          details: `策略: ${gasConfig.gasStrategy}, 倍数: ${gasConfig.gasMultiplier}, 抢救模式: ${gasConfig.rescueMode}`
        })
        
        const result = await akasdaoService.silence(balance, gasConfig)
        
        // 更新统计
        setAutoModeStats(prev => ({
          totalTransactions: prev.totalTransactions + 1,
          totalDaiUsed: (parseFloat(prev.totalDaiUsed) + balanceNum).toString(),
          lastTransactionTime: new Date()
        }))
        
        addLog({
          level: 'success',
          category: 'auto',
          message: '自动silence执行成功',
          details: `交易哈希: ${result.txHash}, DAI数量: ${balance}, 使用${config.rescueMode ? '抢救' : '普通'}模式`
        })
        
        // 添加历史记录
        addHistoryRecord({
          daiAmount: balance,
          gasUsed: '0', // 暂时设为0，后续可以从交易收据获取
          gasPrice: '0', // 暂时设为0，后续可以从交易收据获取
          status: 'success',
          txHash: result.txHash
        })
      }
      
      setLastAutoCheck(new Date())
    } catch (error) {
      console.error('自动silence检查失败:', error)
      addLog({
        level: 'error',
        category: 'auto',
        message: '自动silence检查失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  // 启动自动模式
  const startAutoMode = () => {
    if (autoModeInterval) {
      clearInterval(autoModeInterval)
    }
    
    setAutoModeRunning(true)
    
    // 立即执行一次检查
    checkAndAutoSilence()
    
    // 设置定期检查（每30秒检查一次）
    const interval = setInterval(checkAndAutoSilence, 30000)
    setAutoModeInterval(interval)
    
    addLog({
      level: 'info',
      category: 'auto',
      message: '自动模式已启动',
      details: '每30秒检查一次DAI余额并自动silence'
    })
  }

  // 停止自动模式
  const stopAutoMode = () => {
    if (autoModeInterval) {
      clearInterval(autoModeInterval)
      setAutoModeInterval(null)
    }
    
    setAutoModeRunning(false)
    
    addLog({
      level: 'info',
      category: 'auto',
      message: '自动模式已停止'
    })
  }

  // 手动模式执行
  const executeManualSilence = async () => {
    if (!manualAmount || parseFloat(manualAmount) <= 0) {
      addLog({
        level: 'error',
        category: 'silence',
        message: '请输入有效的DAI数量',
        details: 'DAI数量必须大于0'
      })
      return
    }

    if (parseFloat(manualAmount) > parseFloat(daiBalance)) {
      addLog({
        level: 'error',
        category: 'silence',
        message: 'DAI余额不足',
        details: `需要 ${manualAmount} DAI，当前余额 ${daiBalance} DAI`
      })
      return
    }

    // 检查钱包状态
    if (!walletStatus?.address) {
      addLog({
        level: 'error',
        category: 'silence',
        message: '钱包未连接',
        details: '请先连接钱包'
      })
      return
    }

    // 检查网络连接
    try {
      await akasdaoService.getProvider().getNetwork()
    } catch (error) {
      addLog({
        level: 'error',
        category: 'silence',
        message: '网络连接失败',
        details: '请检查网络连接'
      })
      return
    }

    setIsManualProcessing(true)
    
    try {
      addLog({
        level: 'info',
        category: 'silence',
        message: '开始手动silence',
        details: `DAI数量: ${manualAmount}, 使用${config.rescueMode ? '抢救' : '普通'}模式`
      })
      
      // 传递gas配置
      const gasConfig = {
        gasLimit: config.gasLimit,
        gasStrategy: config.gasStrategy,
        gasMultiplier: config.gasMultiplier,
        rescueMode: config.rescueMode,
        rescueGasMultiplier: config.rescueGasMultiplier
      }
      
      // 添加详细的调试信息
      addLog({
        level: 'info',
        category: 'silence',
        message: 'Gas配置详情',
        details: `策略: ${gasConfig.gasStrategy}, 倍数: ${gasConfig.gasMultiplier}, 抢救模式: ${gasConfig.rescueMode}`
      })
      
      const result = await akasdaoService.silence(manualAmount, gasConfig)
      
      addLog({
        level: 'success',
        category: 'silence',
        message: '手动silence执行成功',
        details: `交易哈希: ${result.txHash}, DAI数量: ${manualAmount}`
      })
      
      // 添加历史记录
      addHistoryRecord({
        daiAmount: manualAmount,
        gasUsed: '0', // 暂时设为0，后续可以从交易收据获取
        gasPrice: '0', // 暂时设为0，后续可以从交易收据获取
        status: 'success',
        txHash: result.txHash
      })
      
      // 清空输入
      setManualAmount('')
      
      // 更新余额
      const newBalance = await akasdaoService.getTokenBalance(TOKEN_ADDRESSES.DAI)
      setDaiBalance(newBalance)
      
    } catch (error) {
      console.error('手动silence失败:', error)
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      
      addLog({
        level: 'error',
        category: 'silence',
        message: '手动silence失败',
        details: errorMessage
      })
      
      // 添加失败历史记录
      addHistoryRecord({
        daiAmount: manualAmount,
        gasUsed: '0',
        gasPrice: '0',
        status: 'failed',
        errorMessage: errorMessage
      })
    } finally {
      setIsManualProcessing(false)
    }
  }

  // 设置最大DAI数量
  const setMaxDai = () => {
    setManualAmount(daiBalance)
  }





  // 调试silence合约调用
  const debugSilenceCall = async () => {
    if (!akasdaoService) {
      addLog({
        level: 'error',
        category: 'service',
        message: 'AkasaDAO服务未初始化'
      })
      return
    }

    setIsDebugging(true)
    addLog({
      level: 'info',
      category: 'service',
      message: '开始调试silence合约调用...'
    })

    try {
      // 1. 检查钱包状态
      addLog({
        level: 'info',
        category: 'service',
        message: '检查钱包状态...'
      })

      const walletAddress = await akasdaoService.getWalletAddress()
      addLog({
        level: 'info',
        category: 'service',
        message: `钱包地址: ${walletAddress}`
      })

      // 2. 检查DAI余额
      addLog({
        level: 'info',
        category: 'service',
        message: '检查DAI余额...'
      })

      const daiBalance = await akasdaoService.getTokenBalance(TOKEN_ADDRESSES.DAI)
      addLog({
        level: 'info',
        category: 'service',
        message: `DAI余额: ${daiBalance} DAI`
      })

      // 3. 检查合约状态
      addLog({
        level: 'info',
        category: 'service',
        message: '检查Turbine合约状态...'
      })

      const provider = akasdaoService.getProvider()
      const contractCode = await provider.getCode(AKASDAO_CONFIG.TURBINE_CONTRACT)
      
      if (contractCode === '0x') {
        addLog({
          level: 'error',
          category: 'service',
          message: 'Turbine合约地址无效或合约不存在'
        })
        return
      }

      addLog({
        level: 'success',
        category: 'service',
        message: 'Turbine合约地址有效'
      })

      // 4. 检查DAI授权
      addLog({
        level: 'info',
        category: 'service',
        message: '检查DAI授权状态...'
      })

      const daiContract = new ethers.Contract(
        TOKEN_ADDRESSES.DAI,
        ['function allowance(address owner, address spender) view returns (uint256)'],
        provider
      )

      const allowance = await daiContract.allowance(walletAddress, AKASDAO_CONFIG.TURBINE_CONTRACT)
      const allowanceFormatted = ethers.formatUnits(allowance, 18)
      
      addLog({
        level: 'info',
        category: 'service',
        message: `DAI授权金额: ${allowanceFormatted} DAI`
      })

      // 5. 测试小额silence调用
      addLog({
        level: 'info',
        category: 'service',
        message: '测试小额silence调用...'
      })

      try {
        const testAmount = '0.001' // 测试0.001 DAI
        // 传递gas配置
        const gasConfig = {
          gasLimit: config.gasLimit,
          gasStrategy: config.gasStrategy,
          gasMultiplier: config.gasMultiplier,
          rescueMode: config.rescueMode,
          rescueGasMultiplier: config.rescueGasMultiplier
        }
        const result = await akasdaoService.silence(testAmount, gasConfig)
        addLog({
          level: 'success',
          category: 'service',
          message: `测试silence调用成功! 交易哈希: ${result.txHash}`
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误'
        addLog({
          level: 'error',
          category: 'service',
          message: `测试silence调用失败: ${errorMessage}`
        })
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      addLog({
        level: 'error',
        category: 'service',
        message: `调试过程中发生错误: ${errorMessage}`
      })
    } finally {
      setIsDebugging(false)
    }
  }

  // 添加历史记录
  const addHistoryRecord = (record: {
    daiAmount: string
    gasUsed: string
    gasPrice: string
    status: 'success' | 'failed'
    txHash?: string
    errorMessage?: string
  }) => {
    const newRecord = {
      id: Date.now().toString(),
      timestamp: new Date(),
      ...record
    }
    setHistoryRecords(prev => [newRecord, ...prev.slice(0, 49)]) // 保留最近50条记录
    
    // 同时添加到全局转账记录
    if (record.status === 'success' && record.txHash) {
      addTransferRecord({
        id: newRecord.id,
        timestamp: newRecord.timestamp,
        fromAddress: walletStatus?.address || '',
        toAddress: '0x43208F448dE982a2d8a2dF8F8E78574b98f2aA74', // Turbine合约地址
        amount: record.daiAmount,
        tokenAddress: TOKEN_ADDRESSES.DAI,
        txHash: record.txHash,
        status: 'confirmed',
        type: 'silence'
      })
    }
  }

  // 清除历史记录
  const clearHistory = () => {
    setHistoryRecords([])
  }

  // 导出历史记录
  const exportHistory = () => {
    const dataStr = JSON.stringify(historyRecords, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `silence-history-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (autoModeInterval) {
        clearInterval(autoModeInterval)
      }
    }
  }, [autoModeInterval])

  if (!walletStatus?.address) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-20">
            <Wallet className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h2 className="text-2xl font-bold text-gray-300 mb-2">请先连接钱包</h2>
            <p className="text-gray-400">连接钱包后才能使用AkasaDAO功能</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* 页面标题和状态栏 */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Coins className="w-8 h-8 text-blue-400" />
              AkasaDAO 协议
            </h1>
            <div className="flex-shrink-0">
              <StatusBar 
                onRefresh={async () => {
                  if (isInitialized) {
                    try {
                      const balance = await akasdaoService.getTokenBalance(TOKEN_ADDRESSES.DAI)
                      setDaiBalance(balance)
                      addLog({
                        level: 'success',
                        category: 'balance',
                        message: 'DAI余额已刷新',
                        details: `当前余额: ${balance} DAI`
                      })
                    } catch (error) {
                      addLog({
                        level: 'error',
                        category: 'balance',
                        message: 'DAI余额刷新失败',
                        details: error instanceof Error ? error.message : '未知错误'
                      })
                    }
                  }
                }}
                isRefreshing={false}
                showRescueMode={true}
              />
            </div>
          </div>
          <p className="text-gray-400">Silence协议 - 将DAI转换为AS代币</p>
        </div>

        {/* 状态信息 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-5 h-5 text-blue-400" />
              <span className="text-sm text-gray-400">钱包地址</span>
            </div>
            <p className="text-sm font-mono text-white truncate">
              {walletStatus.address}
            </p>
          </div>
          
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="w-5 h-5 text-green-400" />
              <span className="text-sm text-gray-400">DAI余额</span>
            </div>
            <p className="text-lg font-bold text-white">
              {parseFloat(daiBalance).toFixed(6)} DAI
            </p>
          </div>
          
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-5 h-5 text-purple-400" />
              <span className="text-sm text-gray-400">Turbine合约</span>
            </div>
            <p className="text-sm font-mono text-white truncate">
              {turbineAddress || '加载中...'}
            </p>
          </div>
        </div>

        {/* 主要功能区域 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* 左边 - 自动模式 */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center gap-3 mb-6">
              <Zap className="w-6 h-6 text-yellow-400" />
              <h2 className="text-xl font-bold text-white">自动模式</h2>
              {autoModeRunning && (
                <div className="flex items-center gap-2 text-green-400">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-sm">运行中</span>
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              <p className="text-gray-300 text-sm">
                开启后自动检测DAI余额，发现余额时自动最大化silence到合约
              </p>
              
              {/* 自动模式控制 */}
              <div className="flex gap-3">
                {!autoModeRunning ? (
                  <button
                    onClick={startAutoMode}
                    disabled={!isInitialized}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                  >
                    <Play className="w-4 h-4" />
                    启动自动模式
                  </button>
                ) : (
                  <button
                    onClick={stopAutoMode}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    <Square className="w-4 h-4" />
                    停止自动模式
                  </button>
                )}
                
                <button
                  onClick={() => {
                    if (isInitialized) {
                      checkAndAutoSilence()
                    }
                  }}
                  disabled={!isInitialized || autoModeRunning}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="w-4 h-4" />
                  立即检查
                </button>
              </div>
              
              {/* 自动模式统计 */}
              {autoModeStats.totalTransactions > 0 && (
                <div className="bg-gray-700 p-4 rounded-md">
                  <h3 className="text-sm font-medium text-gray-300 mb-3">自动模式统计</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">总交易数:</span>
                      <span className="text-white ml-2">{autoModeStats.totalTransactions}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">总DAI使用:</span>
                      <span className="text-white ml-2">{parseFloat(autoModeStats.totalDaiUsed).toFixed(6)} DAI</span>
                    </div>
                  </div>
                  {autoModeStats.lastTransactionTime && (
                    <div className="mt-2 text-xs text-gray-400">
                      最后交易: {autoModeStats.lastTransactionTime.toLocaleString()}
                    </div>
                  )}
                </div>
              )}
              
              {/* 最后检查时间 */}
              {lastAutoCheck && (
                <div className="text-xs text-gray-400 flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  最后检查: {lastAutoCheck.toLocaleString()}
                </div>
              )}
            </div>
          </div>
          
          {/* 右边 - 手动模式 */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center gap-3 mb-6">
              <Settings className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl font-bold text-white">手动模式</h2>
            </div>
            
            <div className="space-y-4">
              <p className="text-gray-300 text-sm">
                手动输入DAI数量进行silence，使用默认gas设置
              </p>
              
              {/* DAI数量输入 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  DAI数量
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    placeholder="输入DAI数量"
                    step="0.000001"
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={setMaxDai}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              

              
              {/* 执行按钮 */}
              <button
                onClick={executeManualSilence}
                disabled={!isInitialized || isManualProcessing || !manualAmount || parseFloat(manualAmount) <= 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                {isManualProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    处理中...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    执行Silence
                  </>
                )}
              </button>
              
              {/* 余额检查提示 */}
              {manualAmount && parseFloat(manualAmount) > parseFloat(daiBalance) && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  DAI余额不足，当前余额: {parseFloat(daiBalance).toFixed(6)} DAI
                </div>
              )}
              
              {/* 调试按钮 */}
              <div className="border-t border-gray-700 pt-4">
                <button
                  onClick={debugSilenceCall}
                  disabled={isDebugging}
                  className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {isDebugging ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      调试中...
                    </>
                  ) : (
                    <>
                      <Bug className="w-4 h-4 mr-2" />
                      调试Silence调用
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 错误显示 */}
        {error && (
          <div className="mt-6 p-4 bg-red-900 border border-red-700 rounded-lg">
            <div className="flex items-center gap-2 text-red-400">
              <XCircle className="w-5 h-5" />
              <span className="font-medium">错误</span>
            </div>
            <p className="text-red-300 mt-1">{error}</p>
          </div>
        )}

        {/* 历史记录 */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5" />
              历史记录
            </h3>
            <div className="flex gap-2">
              <button
                onClick={exportHistory}
                disabled={historyRecords.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                导出
              </button>
              <button
                onClick={clearHistory}
                disabled={historyRecords.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                清空
              </button>
            </div>
          </div>

          {historyRecords.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无历史记录</p>
              <p className="text-sm">执行silence操作后会显示在这里</p>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        时间
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        状态
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        DAI数量
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Gas使用
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Gas价格
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        交易哈希
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {historyRecords.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-750">
                        <td className="px-4 py-3 text-sm text-gray-300">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            {record.timestamp.toLocaleString('zh-CN')}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {record.status === 'success' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-900 text-green-300 rounded-full">
                              <TrendingUp className="w-3 h-3" />
                              成功
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-900 text-red-300 rounded-full">
                              <TrendingDown className="w-3 h-3" />
                              失败
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {parseFloat(record.daiAmount).toFixed(6)} DAI
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {record.gasUsed === '0' ? '-' : `${record.gasUsed} wei`}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {record.gasPrice === '0' ? '-' : `${record.gasPrice} gwei`}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {record.txHash ? (
                            <a
                              href={`https://polygonscan.com/tx/${record.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 truncate block max-w-32"
                              title={record.txHash}
                            >
                              {record.txHash.slice(0, 8)}...{record.txHash.slice(-6)}
                            </a>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 