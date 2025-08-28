import { useState, useCallback, useEffect } from 'react'
import { useWalletStore } from '../store/useWalletStore'
import { AkasaDAODemandService } from '../utils/akasdaoDemand'
import { blockchainService } from '../utils/blockchain'
import { StatusBar } from '../components/StatusBar'
import { 
  Wallet, 
  RefreshCw, 
  TrendingUp,
  DollarSign,
  ArrowRight,
  Activity,
  Zap,
  Lock,
  Unlock,
  Gift
} from 'lucide-react'

export function AkasdaoDemandPage() {
  const { 
    config, 
    addLog, 
    transferRecords,
    addTransferRecord
  } = useWalletStore()

  const [akasdaoService, setAkasdaoService] = useState<AkasaDAODemandService | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [asTokenBalance, setAsTokenBalance] = useState('0')
  const [sAsTokenBalance, setSAsTokenBalance] = useState('0')
  const [stakedAmount, setStakedAmount] = useState('0')
  const [rewardAmount, setRewardAmount] = useState('0')
  
  // 网络检测状态 - 已移至StatusBar组件
  // const [networkStatus, setNetworkStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  // const [isCheckingNetwork, setIsCheckingNetwork] = useState(false)
  
  // 合约验证状态 - 已移至StatusBar组件
  // const [contractValidationStatus, setContractValidationStatus] = useState<'checking' | 'valid' | 'invalid' | 'unknown'>('unknown')

  // 自动质押状态
  const [autoStakeEnabled, setAutoStakeEnabled] = useState(false)
  const [autoStakeInterval, setAutoStakeInterval] = useState<NodeJS.Timeout | null>(null)

  // 输入金额
  const [stakeAmount, setStakeAmount] = useState('')
  const [unstakeAmount, setUnstakeAmount] = useState('')

  // 过滤活期质押相关的转账记录
  const demandRecords = transferRecords.filter(record => record.type === 'demand')

  // 格式化时间
  const formatTime = (timestamp: Date) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  // 网络检测和合约验证已移至StatusBar组件

  // 初始化服务
  const initializeService = useCallback(async () => {
    if (!config.privateKey) return

    try {
      const provider = blockchainService.getProvider()
      const service = new AkasaDAODemandService(provider)
      await service.initializeWallet(config.privateKey)
      setAkasdaoService(service)
      
      addLog({
        level: 'success',
        category: 'service',
        message: '活期质押服务初始化成功',
        details: '服务已准备就绪'
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '服务初始化失败'
      addLog({
        level: 'error',
        category: 'service',
        message: '活期质押服务初始化失败',
        details: errorMessage
      })
    }
  }, [config.privateKey, addLog])

  // 刷新质押信息
  const refreshStakeInfo = useCallback(async () => {
    if (!akasdaoService) return

    setIsLoading(true)
    try {
      const [asBalance, sAsBalance, staked, reward] = await Promise.all([
        akasdaoService.getAsTokenBalance(),
        akasdaoService.getSAsTokenBalance(),
        akasdaoService.getStakedAmount(),
        akasdaoService.getRewardAmount()
      ])

      setAsTokenBalance(asBalance)
      setSAsTokenBalance(sAsBalance)
      setStakedAmount(staked)
      setRewardAmount(reward)

      addLog({
        level: 'success',
        category: 'balance',
        message: '质押信息刷新成功',
        details: `AS: ${asBalance}, sAS: ${sAsBalance}, 已质押: ${staked}, 奖励: ${reward}`
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '刷新失败'
      addLog({
        level: 'error',
        category: 'balance',
        message: '刷新质押信息失败',
        details: errorMessage
      })
    } finally {
      setIsLoading(false)
    }
  }, [akasdaoService, addLog])

  // 执行质押
  const executeStake = useCallback(async (amount: string) => {
    if (!akasdaoService || !amount || parseFloat(amount) <= 0) {
      addLog({
        level: 'error',
        category: 'stake',
        message: '请输入有效的质押数量',
        details: '质押数量必须大于0'
      })
      return
    }

    if (!config.privateKey) {
      addLog({
        level: 'error',
        category: 'stake',
        message: '请先配置私钥',
        details: '需要私钥才能执行质押操作'
      })
      return
    }

    setIsLoading(true)
    try {
      // 检查AS Token余额
      const asBalance = await akasdaoService.getAsTokenBalance()
      if (parseFloat(asBalance) < parseFloat(amount)) {
        addLog({
          level: 'error',
          category: 'stake',
          message: 'AS Token余额不足',
          details: `需要 ${amount} AS, 当前余额 ${asBalance} AS`
        })
        return
      }

      // 检查并授权
      addLog({
        level: 'info',
        category: 'stake',
        message: '正在设置授权...',
        details: '检查AS Token授权状态'
      })

      await akasdaoService.checkAndApproveAsToken(amount)
      
      addLog({
        level: 'success',
        category: 'stake',
        message: '授权设置成功',
        details: 'AS Token授权已完成'
      })

      // 执行质押
      addLog({
        level: 'info',
        category: 'stake',
        message: '正在执行质押...',
        details: `质押 ${amount} AS Token`
      })

      const result = await akasdaoService.stake(amount)
      
      addLog({
        level: 'info',
        category: 'stake',
        message: `质押交易已提交: ${result.txHash}`,
        details: '等待区块链确认'
      })

      // 等待交易确认
      const receipt = await akasdaoService.waitForTransaction(result.txHash)
      
      addLog({
        level: 'success',
        category: 'stake',
        message: `质押成功! 交易哈希: ${receipt.hash}`,
        details: `区块: ${receipt.blockNumber}`
      })

      // 添加转账记录
      addTransferRecord({
        id: Date.now().toString(),
        fromAddress: config.privateKey ? '0x' + config.privateKey.slice(-40) : '',
        toAddress: '0xe3A736f5146b14fA3e7412CE00630f08524a741D',
        amount: amount,
        tokenSymbol: 'AS',
        timestamp: new Date(),
        txHash: result.txHash,
        status: 'confirmed',
        type: 'demand'
      })

      // 刷新余额
      await refreshStakeInfo()
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '质押失败'
      addLog({
        level: 'error',
        category: 'stake',
        message: `质押失败: ${errorMessage}`,
        details: '请检查网络连接和余额'
      })
    } finally {
      setIsLoading(false)
    }
  }, [akasdaoService, config.privateKey, addLog, addTransferRecord, refreshStakeInfo])

  // 执行解质押
  const executeUnstake = useCallback(async (amount: string) => {
    if (!akasdaoService || !amount || parseFloat(amount) <= 0) {
      addLog({
        level: 'error',
        category: 'unstake',
        message: '请输入有效的解质押数量',
        details: '解质押数量必须大于0'
      })
      return
    }

    if (!config.privateKey) {
      addLog({
        level: 'error',
        category: 'unstake',
        message: '请先配置私钥',
        details: '需要私钥才能执行解质押操作'
      })
      return
    }

    setIsLoading(true)
    try {
      addLog({
        level: 'info',
        category: 'unstake',
        message: '正在执行解质押...',
        details: `解质押 ${amount} AS Token`
      })

      const result = await akasdaoService.unstake(amount)
      
      addLog({
        level: 'info',
        category: 'unstake',
        message: `解质押交易已提交: ${result.txHash}`,
        details: '等待区块链确认'
      })

      // 等待交易确认
      const receipt = await akasdaoService.waitForTransaction(result.txHash)
      
      addLog({
        level: 'success',
        category: 'unstake',
        message: `解质押成功! 交易哈希: ${receipt.hash}`,
        details: `区块: ${receipt.blockNumber}`
      })

      // 添加转账记录
      addTransferRecord({
        id: Date.now().toString(),
        fromAddress: '0xe3A736f5146b14fA3e7412CE00630f08524a741D',
        toAddress: config.privateKey ? '0x' + config.privateKey.slice(-40) : '',
        amount: amount,
        tokenSymbol: 'AS',
        timestamp: new Date(),
        txHash: result.txHash,
        status: 'confirmed',
        type: 'demand'
      })

      // 刷新余额
      await refreshStakeInfo()
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '解质押失败'
      addLog({
        level: 'error',
        category: 'unstake',
        message: `解质押失败: ${errorMessage}`,
        details: '请检查网络连接和质押余额'
      })
    } finally {
      setIsLoading(false)
    }
  }, [akasdaoService, config.privateKey, addLog, addTransferRecord, refreshStakeInfo])

  // 领取奖励
  const claimReward = useCallback(async () => {
    if (!akasdaoService) return

    if (!config.privateKey) {
      addLog({
        level: 'error',
        category: 'reward',
        message: '请先配置私钥',
        details: '需要私钥才能领取奖励'
      })
      return
    }

    setIsLoading(true)
    try {
      addLog({
        level: 'info',
        category: 'reward',
        message: '正在领取奖励...',
        details: '检查可领取的奖励'
      })

      const result = await akasdaoService.claimReward()
      
      addLog({
        level: 'info',
        category: 'reward',
        message: `领取奖励交易已提交: ${result.txHash}`,
        details: '等待区块链确认'
      })

      // 等待交易确认
      const receipt = await akasdaoService.waitForTransaction(result.txHash)
      
      addLog({
        level: 'success',
        category: 'reward',
        message: `奖励领取成功! 交易哈希: ${receipt.hash}`,
        details: `区块: ${receipt.blockNumber}`
      })

      // 添加转账记录
      addTransferRecord({
        id: Date.now().toString(),
        fromAddress: '0xe3A736f5146b14fA3e7412CE00630f08524a741D',
        toAddress: config.privateKey ? '0x' + config.privateKey.slice(-40) : '',
        amount: rewardAmount,
        tokenSymbol: 'AS',
        timestamp: new Date(),
        txHash: result.txHash,
        status: 'confirmed',
        type: 'demand'
      })

      // 刷新余额
      await refreshStakeInfo()
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '领取奖励失败'
      addLog({
        level: 'error',
        category: 'reward',
        message: `领取奖励失败: ${errorMessage}`,
        details: '请检查网络连接和奖励余额'
      })
    } finally {
      setIsLoading(false)
    }
  }, [akasdaoService, config.privateKey, addLog, addTransferRecord, refreshStakeInfo, rewardAmount])

  // 停止自动质押
  const stopAutoStake = useCallback(() => {
    if (autoStakeInterval) {
      clearInterval(autoStakeInterval)
      setAutoStakeInterval(null)
    }
    setAutoStakeEnabled(false)
    addLog({
      level: 'info',
      category: 'auto',
      message: '自动质押已停止',
      details: '自动质押功能已关闭'
    })
  }, [autoStakeInterval, addLog])

  // 启动自动质押
  const startAutoStake = useCallback(() => {
    if (autoStakeEnabled) return

    const interval = setInterval(async () => {
      if (!akasdaoService) return

      try {
        const asBalance = await akasdaoService.getAsTokenBalance()
        if (parseFloat(asBalance) > 0.1) { // 如果余额大于0.1 AS
          await executeStake(asBalance)
        }
      } catch (error) {
        console.error('自动质押失败:', error)
      }
    }, 30000) // 每30秒检查一次

    setAutoStakeInterval(interval)
    setAutoStakeEnabled(true)
    addLog({
      level: 'info',
      category: 'auto',
      message: '自动质押已启动，每30秒检查一次',
      details: '当AS Token余额大于0.1时自动质押'
    })
  }, [autoStakeEnabled, akasdaoService, executeStake, addLog])

  // 初始化
  useEffect(() => {
    initializeService()
  }, [initializeService])

  // 定期刷新余额
  useEffect(() => {
    if (akasdaoService) {
      refreshStakeInfo()
      const interval = setInterval(refreshStakeInfo, 10000) // 每10秒刷新一次
      return () => clearInterval(interval)
    }
  }, [akasdaoService, refreshStakeInfo])

  // 清理自动质押
  useEffect(() => {
    return () => {
      if (autoStakeInterval) {
        clearInterval(autoStakeInterval)
      }
    }
  }, [autoStakeInterval])

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* 页面标题和状态栏 */}
      <div className="mb-6">
        {/* 主标题和状态栏在同一行 */}
        <div className="flex items-center justify-between gap-6 mb-2">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <DollarSign className="w-8 h-8 mr-3 text-green-600" />
            AkasaDAO 活期质押
          </h1>
          
          {/* 状态栏 */}
          <div className="flex-shrink-0">
                          <StatusBar 
                onRefresh={refreshStakeInfo}
                isRefreshing={isLoading}
                showRescueMode={false}
              />
          </div>
        </div>
        
        {/* 副标题单独一行 */}
        <p className="text-gray-600">
          管理您的 AS Token 活期质押，获得稳定收益
        </p>
      </div>

      {/* 余额卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">AS Token 余额</p>
              <p className="text-2xl font-bold text-gray-900">{asTokenBalance}</p>
            </div>
            <Wallet className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">sAS Token 余额</p>
              <p className="text-2xl font-bold text-gray-900">{sAsTokenBalance}</p>
            </div>
            <Lock className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">已质押金额</p>
              <p className="text-2xl font-bold text-gray-900">{stakedAmount}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-purple-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">可领取奖励</p>
              <p className="text-2xl font-bold text-gray-900">{rewardAmount}</p>
            </div>
            <Gift className="w-8 h-8 text-orange-600" />
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">快速操作</h2>
          <button
            onClick={refreshStakeInfo}
            disabled={isLoading}
            className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? '刷新中...' : '刷新余额'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 质押操作 */}
          <div className="space-y-3">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Lock className="w-5 h-5 mr-2 text-green-600" />
              质押 AS Token
            </h3>
            <div className="flex space-x-2">
              <input
                type="number"
                placeholder="质押数量"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <button
                onClick={() => executeStake(stakeAmount)}
                disabled={isLoading || !config.isConfigured || !stakeAmount}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '处理中...' : '质押'}
              </button>
            </div>
          </div>

          {/* 解质押操作 */}
          <div className="space-y-3">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Unlock className="w-5 h-5 mr-2 text-blue-600" />
              解质押 AS Token
            </h3>
            <div className="flex space-x-2">
              <input
                type="number"
                placeholder="解质押数量"
                value={unstakeAmount}
                onChange={(e) => setUnstakeAmount(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={() => executeUnstake(unstakeAmount)}
                disabled={isLoading || !config.isConfigured || !unstakeAmount}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '处理中...' : '解质押'}
              </button>
            </div>
          </div>

          {/* 领取奖励 */}
          <div className="space-y-3">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Gift className="w-5 h-5 mr-2 text-orange-600" />
              领取奖励
            </h3>
            <button
              onClick={claimReward}
              disabled={isLoading || !config.isConfigured || parseFloat(rewardAmount) <= 0}
              className="w-full px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '处理中...' : `领取 ${rewardAmount} AS`}
            </button>
          </div>
        </div>
      </div>

      {/* 自动质押控制 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <Zap className="w-5 h-5 mr-2 text-yellow-600" />
              自动质押
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              自动将AS Token余额质押，每30秒检查一次
            </p>
          </div>
          
          <div className="flex space-x-3">
            {autoStakeEnabled ? (
              <button
                onClick={stopAutoStake}
                className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                停止自动质押
              </button>
            ) : (
              <button
                onClick={startAutoStake}
                disabled={!config.isConfigured}
                className="px-6 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                启动自动质押
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 活期质押历史记录 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">活期质押历史记录</h2>
          <span className="text-sm text-gray-500">
            共 {demandRecords.length} 条记录
            ({demandRecords.filter((r: any) => r.status === 'confirmed').length} 已确认, 
             {demandRecords.filter((r: any) => r.status === 'pending').length} 待确认, 
             {demandRecords.filter((r: any) => r.status === 'failed').length} 失败)
          </span>
        </div>
        
        <div className="space-y-3">
          {demandRecords.length > 0 ? (
            demandRecords
              .slice(0, 10)
              .map((record: any) => (
              <div key={record.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      record.status === 'confirmed' ? 'bg-green-500' :
                      record.status === 'failed' ? 'bg-red-500' :
                      'bg-yellow-500'
                    }`} />
                    <div>
                      <p className="font-medium text-gray-900">
                        {record.action === 'stake' ? '质押' : 
                         record.action === 'unstake' ? '解质押' : '领取奖励'} {record.amount} {record.tokenSymbol || 'AS'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatTime(record.timestamp)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className={`text-sm font-medium ${
                      record.status === 'confirmed' ? 'text-green-600' :
                      record.status === 'failed' ? 'text-red-600' :
                      'text-yellow-600'
                    }`}>
                      {record.status === 'confirmed' ? '成功' :
                       record.status === 'failed' ? '失败' : '处理中'}
                    </p>
                    {record.txHash && (
                      <a
                        href={`https://polygonscan.com/tx/${record.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 mt-1"
                      >
                        查看交易
                        <ArrowRight className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
                
                {record.error && (
                  <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-600">
                    错误: {record.error}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center text-gray-500 py-8">
              <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>暂无活期质押记录</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 