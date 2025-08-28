import { useState, useEffect, useCallback } from 'react'
import { Activity, Play, Pause, AlertTriangle, Wallet, ArrowRight, RefreshCw, Lock, TrendingUp, X } from 'lucide-react'
import { useWalletStore } from '../store/useWalletStore'
import { blockchainService } from '../utils/blockchain'
import { getPrivateKey, hasStoredPrivateKey, isPrivateKeyProtected } from '../utils/encryption'
import { AkasaDAOService } from '../utils/akasdao'
import { TOKEN_ADDRESSES } from '../utils/tokens'
import { validateContractAddress } from '../utils/contractValidation'
import { TransactionVerifier } from '../utils/transactionVerifier'
import { rpcOptimizer } from '../utils/rpcOptimizer'

export function MonitorPage() {
  const {
    config,
    walletStatus,
    isMonitoring,
    transferRecords,
    addLog,
    setWalletStatus,
    setMonitoring,
    addTransferRecord,
    updateTransferRecord,
    setError,
    setConfig,
    clearWalletStatus
  } = useWalletStore()
  
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isTransferring, setIsTransferring] = useState(false)
  const [error, setLocalError] = useState<string | null>(null)
  const [monitoringInterval, setMonitoringInterval] = useState<NodeJS.Timeout | null>(null)
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [password, setPassword] = useState('')
  const [showPasswordInput, setShowPasswordInput] = useState(false)
  const [isKeyProtected, setIsKeyProtected] = useState(false)
  const [lastBalanceUpdate, setLastBalanceUpdate] = useState<Date | null>(null)
  const [networkStatus, setNetworkStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking')
  const [akasdaoService, setAkasdaoService] = useState<AkasaDAOService | null>(null)
  const [daiBalance, setDaiBalance] = useState('0')

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
  const [transactionVerifier, setTransactionVerifier] = useState<TransactionVerifier | null>(null)

  // 页面加载时检查私钥保护状态
  useEffect(() => {
    setIsKeyProtected(isPrivateKeyProtected())
  }, [])

  // 初始化服务
  useEffect(() => {
    const initializeServices = async () => {
      const provider = blockchainService.getProvider()
      
      // 初始化AkasaDAO服务
      if (config.isConfigured && config.privateKey) {
        const service = new AkasaDAOService(provider)
        setAkasdaoService(service)
      } else if (hasStoredPrivateKey()) {
        try {
          const privateKey = getPrivateKey()
          if (privateKey) {
            const service = new AkasaDAOService(provider)
            setAkasdaoService(service)
            
            addLog({
              level: 'info',
              category: 'system',
              message: 'AkasaDAO服务已自动初始化',
              details: '使用已存储的私钥'
            })
          }
        } catch (error) {
          addLog({
            level: 'error',
            category: 'system',
            message: 'AkasaDAO服务初始化失败',
            details: error instanceof Error ? error.message : '未知错误'
          })
        }
      }
      
      // 初始化交易验证器
      setTransactionVerifier(new TransactionVerifier(provider))
    }

    initializeServices()
  }, [config.isConfigured, config.privateKey, addLog])

  // 验证转账记录状态
  const verifyTransferRecord = useCallback(async (recordId: string, txHash: string) => {
    if (!transactionVerifier) return
    
    try {
      const status = await transactionVerifier.verifyTransaction(txHash)
      
      // 更新转账记录状态
      if (status.isConfirmed) {
        updateTransferRecord(recordId, {
          status: 'confirmed',
          error: null
        })
        
        addLog({
          level: 'success',
          category: 'transaction',
          message: '交易确认成功',
          details: `交易哈希: ${txHash}, 区块: ${status.blockNumber}`
        })
      } else if (status.isFailed) {
        updateTransferRecord(recordId, {
          status: 'failed',
          error: status.error || '交易失败'
        })
        
        addLog({
          level: 'error',
          category: 'transaction',
          message: '交易失败',
          details: `交易哈希: ${txHash}, 错误: ${status.error}`
        })
      }
    } catch (error) {
      console.error('验证交易状态失败:', error)
    }
  }, [transactionVerifier, updateTransferRecord, addLog])

  // 页面加载时自动恢复已存储的私钥（仅在配置完成时执行一次）
  useEffect(() => {
    const autoRestoreWallet = async () => {
      if (config.isConfigured && walletStatus?.address) {
        // 钱包已经连接，不需要恢复
        setIsPageLoading(false)
        return
      }

      if (hasStoredPrivateKey()) {
        try {
          let privateKey: string | null = null
          
          if (isPrivateKeyProtected()) {
            // 私钥受密码保护，需要用户输入密码
            setShowPasswordInput(true)
            setIsPageLoading(false)
            return
          } else {
            // 私钥未受密码保护，直接获取
            privateKey = getPrivateKey()
          }
          
          if (privateKey) {
            // 自动恢复钱包（不获取余额，避免乱跳）
            const address = await blockchainService.initializeWallet(privateKey)
            
            setWalletStatus({
              address,
              balance: '0', // 不自动获取余额，让用户手动刷新
              isConnected: true,
              lastChecked: new Date()
            })
            
            addLog({
              level: 'success',
              category: 'system',
              message: '钱包自动恢复成功',
              details: `地址: ${address}，请手动刷新余额`
            })
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '钱包自动恢复失败'
          addLog({
            level: 'error',
            category: 'system',
            message: '钱包自动恢复失败',
            details: errorMessage
          })
        }
      }
      
      setIsPageLoading(false)
    }

    autoRestoreWallet()
  }, [config.isConfigured, addLog, setWalletStatus]) // 移除 walletStatus?.address 依赖

  // 初始加载时设置DAI余额为0（不自动刷新）
  useEffect(() => {
    if (config.isConfigured && config.akasdaoEnabled) {
      // 不自动刷新DAI余额，避免在没有开启监控时频繁请求
      setDaiBalance('0')
      addLog({
        level: 'info',
        category: 'monitoring',
        message: 'DAI余额已初始化',
        details: '请在开启监控时自动刷新DAI余额'
      })
    }
  }, [config.isConfigured, config.akasdaoEnabled, addLog])

  // 检查合约验证状态
  const checkContractValidationStatus = useCallback(async () => {
    setIsCheckingContractStatus(true)
    
    try {
      // 从localStorage获取已验证的合约信息
      const storedContracts = localStorage.getItem('validated_contracts')
      
      if (!storedContracts) {
        setContractValidationStatus(null)
        addLog({
          level: 'info',
          category: 'system',
          message: '未找到已验证的合约',
          details: '请前往首页进行合约验证'
        })
        return
      }

      const validatedContracts = JSON.parse(storedContracts)
      const currentNetworkId = 137 // Polygon主网，与akasdao.ts保持一致
      
      // 查找当前网络的已验证合约
      const contractKey = Object.keys(validatedContracts).find(key => 
        validatedContracts[key].networkId === currentNetworkId
      )
      
      if (!contractKey) {
        setContractValidationStatus(null)
        addLog({
          level: 'info',
          category: 'system',
          message: '当前网络未找到已验证的合约',
          details: `网络ID: ${currentNetworkId}`
        })
        return
      }
      
      const contractInfo = validatedContracts[contractKey]
      
      // 验证合约信息是否仍然有效
      try {
        const result = await validateContractAddress(contractInfo.address, blockchainService.getProvider())
        
        if (result.isValid) {
          setContractValidationStatus({
            isValid: true,
            contractType: result.contractType || contractInfo.contractType || 'Unknown',
            name: result.name || contractInfo.name || 'Unknown',
            symbol: result.symbol || contractInfo.symbol || 'Unknown',
            decimals: result.decimals || contractInfo.decimals || 0,
            address: contractInfo.address
          })
          
          addLog({
            level: 'success',
            category: 'system',
            message: '合约验证状态检查成功',
            details: `${result.contractType} - ${result.name} (${result.symbol})`
          })
        } else {
          setContractValidationStatus({
            isValid: false,
            contractType: 'Unknown',
            name: 'Unknown',
            symbol: 'Unknown',
            decimals: 0,
            address: contractInfo.address,
            error: result.error || '合约验证失败'
          })
          
          addLog({
            level: 'error',
            category: 'system',
            message: '合约验证状态检查失败',
            details: result.error || '合约已失效'
          })
        }
      } catch (error) {
        setContractValidationStatus({
          isValid: false,
          contractType: 'Unknown',
          name: 'Unknown',
          symbol: 'Unknown',
          decimals: 0,
          address: contractInfo.address,
          error: error instanceof Error ? error.message : '验证失败'
        })
        
        addLog({
          level: 'error',
          category: 'system',
          message: '合约验证状态检查失败',
          details: error instanceof Error ? error.message : '验证失败'
        })
      }
    } catch (error) {
      setContractValidationStatus(null)
      addLog({
        level: 'error',
        category: 'system',
        message: '检查合约验证状态失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    } finally {
      setIsCheckingContractStatus(false)
    }
  }, [addLog])

  // 初始加载时检查合约验证状态
  useEffect(() => {
    if (config.isConfigured) {
      checkContractValidationStatus()
    }
  }, [config.isConfigured, checkContractValidationStatus])

  // 获取私钥的辅助函数
  const getStoredPrivateKey = (): string | null => {
    try {
      // 首先尝试从 Zustand store 获取
      if (config.privateKey) {
        return config.privateKey
      }
      
      // 如果 store 中没有，尝试从 localStorage 获取
      if (isKeyProtected) {
        if (!password.trim()) {
          throw new Error('需要密码来解密私钥')
        }
        return getPrivateKey(password)
      } else {
        return getPrivateKey()
      }
    } catch (error) {
      console.error('获取私钥失败:', error)
      return null
    }
  }

  // 处理密码输入
  const handlePasswordSubmit = async () => {
    if (!password.trim()) {
      setLocalError('请输入密码')
      return
    }

    try {
      const privateKey = getPrivateKey(password)
      if (!privateKey) {
        setLocalError('密码错误或私钥不存在')
        return
      }

      // 自动恢复钱包
      const address = await blockchainService.initializeWallet(privateKey)
      const balance = await blockchainService.getBalance()
      
      setWalletStatus({
        address,
        balance,
        isConnected: true,
        lastChecked: new Date()
      })
      
      setShowPasswordInput(false)
      setPassword('')
      
      addLog({
        level: 'success',
        category: 'system',
        message: '钱包密码验证成功',
        details: `地址: ${address}, 余额: ${balance} MATIC`
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '密码验证失败'
      setLocalError(errorMessage)
      addLog({
        level: 'error',
        category: 'system',
        message: '密码验证失败',
        details: errorMessage
      })
    }
  }

  // 刷新DAI余额（强制清除缓存，获取最新数据）
  const refreshDaiBalance = useCallback(async () => {
    if (!akasdaoService || !config.isConfigured) return

    try {
      // 强制清除所有缓存，确保获取最新DAI余额
      console.log('🧹 强制清除缓存，获取最新DAI余额...')
      rpcOptimizer.clearCache()
      
      // 首先尝试从 Zustand store 获取私钥
      let privateKey: string | null = config.privateKey
      if (!privateKey) {
        // 如果 store 中没有，尝试从 localStorage 获取
        privateKey = getPrivateKey()
      }
      
      if (!privateKey) {
        throw new Error('未找到私钥，请先在配置页面导入钱包')
      }

      await akasdaoService.initializeWallet(privateKey)
      const balance = await akasdaoService.getTokenBalance(TOKEN_ADDRESSES.DAI)
      setDaiBalance(balance)

      addLog({
        level: 'info',
        category: 'monitoring',
        message: 'DAI余额已强制刷新',
        details: `最新余额: ${balance} DAI（已清除缓存）`
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '刷新DAI余额失败'
      addLog({
        level: 'error',
        category: 'monitoring',
        message: 'DAI余额刷新失败',
        details: errorMessage
      })
    }
  }, [akasdaoService, config.isConfigured, addLog])

  // 刷新余额（强制从区块链获取最新数据，不使用任何缓存）
  const refreshBalance = useCallback(async () => {
    if (!config.isConfigured || isRefreshing) return

    try {
      setIsRefreshing(true)
      setLocalError(null)
      
      // 强制清除所有缓存，确保获取最新余额
      console.log('🧹 强制清除所有缓存，获取最新余额...')
      rpcOptimizer.clearCache()
      
      // 清除前端钱包状态缓存，强制重新获取
      setWalletStatus({
        address: '',
        balance: '0',
        isConnected: false,
        lastChecked: new Date()
      })
      
      const privateKey = getStoredPrivateKey()
      if (!privateKey) {
        throw new Error('未找到私钥')
      }

      await blockchainService.initializeWallet(privateKey)
      const address = blockchainService.getWalletAddress()
      
      if (!address) {
        throw new Error('无法获取钱包地址')
      }

      let balance: string
      let tokenInfo: any = undefined

      // 根据配置决定获取原生代币还是ERC20代币余额
      if (config.transferType === 'token' && config.tokenAddress) {
        // 检查代币地址是否有效
        if (!config.tokenAddress.trim()) {
          throw new Error('代币地址不能为空')
        }
        
        // 获取ERC20代币余额（强制不使用缓存）
        try {
          console.log(`🔍 强制查询代币余额: ${config.tokenAddress}`)
          const tokenBalance = await blockchainService.getTokenBalance(config.tokenAddress, address)
          balance = tokenBalance.formattedBalance
          tokenInfo = tokenBalance.tokenInfo
          console.log(`✅ 代币余额查询成功: ${balance} ${tokenInfo.symbol} (精度: ${tokenInfo.decimals})`)
        } catch (tokenError) {
          console.error('代币余额获取失败:', tokenError)
          
          // 提供更详细的错误信息
          let errorMessage = '获取代币余额失败'
          if (tokenError instanceof Error) {
            if (tokenError.message.includes('rate limit') || tokenError.message.includes('too many requests')) {
              errorMessage = 'RPC请求过于频繁，请稍后重试'
            } else if (tokenError.message.includes('timeout') || tokenError.message.includes('Load failed')) {
              errorMessage = '网络连接超时，请检查网络连接'
            } else if (tokenError.message.includes('invalid address')) {
              errorMessage = '代币合约地址无效'
            } else if (tokenError.message.includes('contract')) {
              errorMessage = '代币合约不存在或已失效'
      } else {
              errorMessage = `获取代币余额失败: ${tokenError.message}`
            }
          }
          
          throw new Error(errorMessage)
        }
      } else {
        // 获取原生代币余额（强制不使用缓存）
        try {
          console.log(`🔍 强制查询MATIC余额`)
        balance = await blockchainService.getBalance(address)
          console.log(`✅ MATIC余额查询成功: ${balance} MATIC`)
        } catch (balanceError) {
          console.error('MATIC余额获取失败:', balanceError)
          
          let errorMessage = '获取MATIC余额失败'
          if (balanceError instanceof Error) {
            if (balanceError.message.includes('rate limit') || balanceError.message.includes('too many requests')) {
              errorMessage = 'RPC请求过于频繁，请稍后重试'
            } else if (balanceError.message.includes('timeout') || balanceError.message.includes('Load failed')) {
              errorMessage = '网络连接超时，请检查网络连接'
            } else {
              errorMessage = `获取MATIC余额失败: ${balanceError.message}`
            }
          }
          
          throw new Error(errorMessage)
        }
      }
      
      // 验证余额数据有效性
      if (!balance || isNaN(parseFloat(balance))) {
        throw new Error('获取到的余额数据无效')
      }
      
      // 更新钱包状态，使用当前时间
      const currentTime = new Date()
      setWalletStatus({
        address,
        balance,
        isConnected: true,
        lastChecked: currentTime,
        tokenInfo
      })
      
      setLastBalanceUpdate(currentTime)
      console.log(`✅ 余额更新成功: ${balance} ${tokenInfo?.symbol || 'MATIC'}`)
      
      addLog({
        level: 'success',
        category: 'balance',
        message: '余额刷新成功',
        details: `最新余额: ${balance} ${tokenInfo?.symbol || 'MATIC'}`
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '刷新余额失败'
      setLocalError(errorMessage)
      addLog({
        level: 'error',
        category: 'monitoring',
        message: '余额刷新失败',
        details: errorMessage
      })
    } finally {
      setIsRefreshing(false)
    }
  }, [config.isConfigured, config.transferType, config.tokenAddress, addLog, setWalletStatus]) // 移除 isRefreshing 依赖

  // 手动转账
  const handleManualTransfer = useCallback(async () => {
    if (!config.isConfigured) return

    try {
      setIsTransferring(true)
      setLocalError(null)

      // 强制刷新余额，确保使用最新数据
      console.log('🔄 手动转账前强制刷新余额...')
      await refreshBalance()
      
      // 等待余额更新
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // 获取最新余额
      const currentWalletStatus = useWalletStore.getState().walletStatus
      const currentBalance = currentWalletStatus?.balance || '0'
      
      if (!currentBalance || currentBalance === '0') {
        throw new Error('余额不足，无法转账')
      }

      const privateKey = getStoredPrivateKey()
      if (!privateKey) {
        throw new Error('未找到私钥')
      }

      await blockchainService.initializeWallet(privateKey)
      
      let result: any
      let tokenSymbol = 'MATIC'
      let tokenAddress = undefined

      // 根据配置决定转账类型
      if (config.transferType === 'token' && config.tokenAddress) {
        // ERC20代币转账
        result = await blockchainService.transferToken(
          config.tokenAddress,
          config.targetAddress,
          currentBalance, // 使用最新余额
          privateKey,
          config.rescueMode ? 'custom' : config.gasStrategy,
          config.rescueMode ? {
            gasMultiplier: config.rescueGasMultiplier,
            crazyMode: true
          } : (config.gasStrategy === 'custom' ? {
            gasMultiplier: config.gasMultiplier || 1,
            crazyMode: config.crazyMode || false
          } : undefined)
        )
        tokenSymbol = currentWalletStatus?.tokenInfo?.symbol || 'TOKEN'
        tokenAddress = config.tokenAddress
      } else {
        // 原生代币转账
        result = await blockchainService.transfer(
          config.targetAddress,
          currentBalance, // 使用最新余额
          privateKey,
          config.rescueMode ? 'custom' : config.gasStrategy,
          config.rescueMode ? {
            gasMultiplier: config.rescueGasMultiplier,
            crazyMode: true
          } : (config.gasStrategy === 'custom' ? {
            gasMultiplier: config.gasMultiplier || 1,
            crazyMode: config.crazyMode || false
          } : undefined)
        )
      }

      // 记录转账 - 先设置为pending状态
      const recordId = Date.now().toString()
      addTransferRecord({
        id: recordId,
        fromAddress: currentWalletStatus?.address || '',
        toAddress: config.targetAddress,
        amount: currentBalance,
        tokenSymbol,
        tokenAddress,
        targetAddress: config.targetAddress,
        txHash: result.txHash,
        status: result.success ? 'pending' : 'failed',
        timestamp: new Date(),
        type: 'manual',
        error: result.error || null
      })

      // 如果交易成功，验证交易状态
      if (result.success && result.txHash) {
        // 延迟验证，给交易一些时间上链
        setTimeout(() => {
          verifyTransferRecord(recordId, result.txHash)
        }, 5000) // 5秒后验证
      }

      addLog({
        level: 'info',
        category: 'transfer',
        message: '手动转账成功',
        details: `转账 ${currentBalance} ${tokenSymbol} 到 ${config.targetAddress}`
      })

      // 刷新余额
      await refreshBalance()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '转账失败'
      setLocalError(errorMessage)
      
      addLog({
        level: 'error',
        category: 'transfer',
        message: '手动转账失败',
        details: errorMessage
      })
    } finally {
      setIsTransferring(false)
    }
  }, [config, addTransferRecord, addLog]) // 移除 walletStatus 依赖

  // 验证配置
  const validateConfig = useCallback(() => {
    if (!config.isConfigured) {
      throw new Error('请先完成钱包配置')
    }

    if (!config.targetAddress.trim()) {
      throw new Error('请设置目标转账地址')
    }

    if (config.transferType === 'token') {
      if (!config.tokenAddress?.trim()) {
        throw new Error('代币转账模式下必须设置代币合约地址')
      }
    }

    if (parseFloat(config.minTransferAmount) <= 0) {
      throw new Error('最小转账金额必须大于0')
    }
  }, [config])

  // 切换监控状态
  const handleToggleMonitoring = useCallback(() => {
      if (isMonitoring) {
        // 停止监控
        if (monitoringInterval) {
          clearInterval(monitoringInterval)
          setMonitoringInterval(null)
        }
        setMonitoring(false)
        addLog({
          level: 'info',
        category: 'monitoring',
        message: '监控已停止',
        details: '用户手动停止监控'
        })
      } else {
      // 验证配置
      try {
        validateConfig()
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '配置验证失败'
        setLocalError(errorMessage)
        addLog({
          level: 'error',
          category: 'monitoring',
          message: '监控启动失败',
          details: errorMessage
        })
        return
      }

      // 开始监控时强制刷新DAI余额
      if (config.akasdaoEnabled && akasdaoService) {
        console.log('🚀 监控启动时强制刷新DAI余额...')
        refreshDaiBalance().catch(error => {
          console.warn('监控启动时DAI余额刷新失败:', error)
        })
      }
      
      // 开始监控
      addLog({
        level: 'info',
        category: 'monitoring',
        message: '监控已启动',
        details: `检查间隔: ${config.rescueMode ? `${config.rescueInterval}毫秒` : `${config.checkInterval || 3}秒`}`
      })
      
      const interval = setInterval(async () => {
        try {
          if (!config.isConfigured) return

          // 立即刷新余额，获取最新状态
          console.log('🚀 监控检查 - 立即刷新余额...')
          
        addLog({
          level: 'info',
            category: 'monitoring',
            message: '监控检查开始',
            details: '立即刷新余额获取最新状态'
        })

        await refreshBalance()

          const currentWalletStatus = useWalletStore.getState().walletStatus
          const currentBalance = currentWalletStatus?.balance || '0'
          
          console.log(`🔍 监控检查 - 当前余额: ${currentBalance}`)
          
          if (!currentBalance || currentBalance === '0') {
            console.log('⚠️ 余额为0，跳过本次检查')
              addLog({
                level: 'info',
                category: 'monitoring',
              message: '监控检查完成',
              details: '余额为0，跳过自动转账'
            })
            return
          }

          // 检查是否启用了自动转账
          if (!config.autoTransfer) {
      addLog({
              level: 'info',
        category: 'monitoring',
              message: '监控检查完成',
              details: '自动转账已禁用，跳过转账'
            })
      return
    }

          const balance = parseFloat(currentBalance)
          const minAmount = parseFloat(config.minTransferAmount)

          console.log(`🔍 检查余额: ${balance} >= ${minAmount} ? ${balance >= minAmount}`)

          // 检查AkasaDAO Silence协议
          if (config.akasdaoEnabled && akasdaoService) {
            try {
              console.log('🔍 检查AkasaDAO Silence协议...')
              
              // 强制刷新DAI余额，确保获取最新数据
              await refreshDaiBalance()
              
              // 获取最新的DAI余额状态
              const daiBalanceNum = parseFloat(daiBalance)
              const akasdaoMinAmount = parseFloat(config.akasdaoMinAmount || '0')
              
              console.log(`🔍 检查DAI余额: ${daiBalanceNum} >= ${akasdaoMinAmount} ? ${daiBalanceNum >= akasdaoMinAmount}`)
              
              if (daiBalanceNum >= akasdaoMinAmount) {
                console.log('🚀 执行AkasaDAO Silence调用...')
                
                const privateKey = getStoredPrivateKey()
      if (!privateKey) {
        throw new Error('未找到私钥')
      }

                await akasdaoService.initializeWallet(privateKey)
                const walletAddress = akasdaoService.getWalletAddress()
      
                if (!walletAddress) {
        throw new Error('无法获取钱包地址')
      }

                // 调用Silence函数，传递gas配置
                const gasConfig = {
                  gasLimit: config.gasLimit,
                  gasStrategy: config.gasStrategy,
                  gasMultiplier: config.gasMultiplier,
                  rescueMode: config.rescueMode,
                  rescueGasMultiplier: config.rescueGasMultiplier
                }
                // 使用最新刷新的DAI余额
                const result = await akasdaoService.silence(daiBalance, gasConfig)

                // 添加转账记录 - AkasaDAO silence调用成功
                addTransferRecord({
                  id: Date.now().toString(),
                  fromAddress: walletAddress,
                  toAddress: 'AkasaDAO Turbine',
                  amount: daiBalance,
                  tokenAddress: TOKEN_ADDRESSES.DAI,
                  tokenSymbol: 'DAI',
                  txHash: result.txHash,
                  status: 'confirmed',
                  timestamp: new Date(),
                  type: 'silence',
                  error: null
                })

                addLog({
                  level: 'success',
                  category: 'transaction',
                  message: 'AkasaDAO Silence自动调用成功',
                  details: `金额: ${daiBalance} DAI, 交易哈希: ${result.txHash}`
                })

                // 刷新DAI余额
                await refreshDaiBalance()
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'AkasaDAO Silence调用失败'
              addLog({
                level: 'error',
                category: 'transaction',
                message: 'AkasaDAO Silence自动调用失败',
                details: errorMessage
              })
            }
          }

          // 检查是否需要执行自动转账
          if (balance >= minAmount) {
            // 立即执行自动转账
        addLog({
              level: 'success',
              category: 'monitoring',
              message: '🚀 立即触发自动转账',
              details: `余额 ${balance} >= 最小金额 ${minAmount}，立即执行转账`
            })
            
            const privateKey = getStoredPrivateKey()
            if (!privateKey) {
              throw new Error('未找到私钥')
            }

            await blockchainService.initializeWallet(privateKey)
            
            let result: any
            let tokenSymbol = 'MATIC'
            let tokenAddress = undefined

            // 根据配置决定转账类型
            if (config.transferType === 'token' && config.tokenAddress) {
              // ERC20代币转账
              result = await blockchainService.transferToken(
          config.tokenAddress,
          config.targetAddress,
                currentBalance,
                privateKey,
                config.rescueMode ? 'custom' : config.gasStrategy,
                config.rescueMode ? {
                  gasMultiplier: config.rescueGasMultiplier,
                  crazyMode: true
                } : (config.gasStrategy === 'custom' ? {
                  gasMultiplier: config.gasMultiplier || 1,
                  crazyMode: config.crazyMode || false
                } : undefined)
              )
              tokenSymbol = currentWalletStatus?.tokenInfo?.symbol || 'TOKEN'
              tokenAddress = config.tokenAddress
      } else {
              // 原生代币转账
              result = await blockchainService.transfer(
                config.targetAddress,
                currentBalance,
                privateKey,
                config.rescueMode ? 'custom' : config.gasStrategy,
                config.rescueMode ? {
                  gasMultiplier: config.rescueGasMultiplier,
                  crazyMode: true
                } : (config.gasStrategy === 'custom' ? {
          gasMultiplier: config.gasMultiplier || 1,
          crazyMode: config.crazyMode || false
                } : undefined)
              )
            }

            // 记录转账 - 先设置为pending状态
            const recordId = Date.now().toString()
      addTransferRecord({
              id: recordId,
              fromAddress: currentWalletStatus?.address || '',
        toAddress: config.targetAddress,
              amount: currentBalance,
              tokenSymbol,
              tokenAddress,
              targetAddress: config.targetAddress,
              txHash: result.txHash,
              status: result.success ? 'pending' : 'failed',
        timestamp: new Date(),
              type: 'auto',
              error: result.error || null
            })

            // 如果交易成功，验证交易状态
            if (result.success && result.txHash) {
              // 延迟验证，给交易一些时间上链
              setTimeout(() => {
                verifyTransferRecord(recordId, result.txHash)
              }, 5000) // 5秒后验证
            }

      addLog({
              level: 'info',
        category: 'transfer',
              message: '自动转账成功',
              details: `转账 ${currentBalance} ${tokenSymbol} 到 ${config.targetAddress}`
      })

      // 刷新余额
      await refreshBalance()
            
            addLog({
              level: 'success',
              category: 'monitoring',
              message: '自动转账完成',
              details: `转账 ${currentBalance} ${tokenSymbol} 到 ${config.targetAddress}`
            })
            
            // 转账完成后立即再次检查余额，确保没有遗漏
            setTimeout(async () => {
              try {
                console.log('🔄 转账完成后立即再次检查余额...')
                await refreshBalance()
                const newWalletStatus = useWalletStore.getState().walletStatus
                const newBalance = parseFloat(newWalletStatus?.balance || '0')
                
                if (newBalance >= minAmount) {
                  addLog({
                    level: 'warning',
                    category: 'monitoring',
                    message: '检测到仍有余额',
                    details: `转账后余额: ${newBalance}，可能还有待转账的金额`
                  })
                }
    } catch (error) {
                console.warn('转账后余额检查失败:', error)
              }
            }, 2000) // 2秒后立即检查
          } else {
            // 余额不足，不执行转账
            addLog({
              level: 'info',
              category: 'monitoring',
              message: '监控检查完成',
              details: `余额 ${balance} < 最小金额 ${minAmount}，跳过自动转账`
            })
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '自动转账失败'
          setError(errorMessage)
          
      addLog({
        level: 'error',
        category: 'transfer',
            message: '自动转账失败',
        details: errorMessage
      })
        }
      }, config.rescueMode ? config.rescueInterval : Math.max(100, (config.checkInterval || 0.5) * 1000)) // 使用配置的检查间隔，最小100毫秒

      setMonitoringInterval(interval)
      setMonitoring(true)
      
      // 计算实际使用的Gas倍数
      const actualGasMultiplier = config.rescueMode 
        ? config.rescueGasMultiplier 
        : (config.gasStrategy === 'custom' ? (config.gasMultiplier || 1) : 1)
      
      addLog({
        level: 'info',
        category: 'monitoring',
        message: config.rescueMode ? '🚨 疯狂抢救模式已启动' : '⚡ 极速监控已启动',
        details: config.rescueMode 
          ? `检查间隔: ${config.rescueInterval}毫秒, Gas倍数: ${config.rescueGasMultiplier}倍, 最小转账金额: ${config.minTransferAmount}`
          : `检查间隔: ${Math.max(100, (config.checkInterval || 0.5) * 1000)}毫秒, Gas倍数: ${actualGasMultiplier}倍, 最小转账金额: ${config.minTransferAmount}`
      })
    }
  }, [isMonitoring, monitoringInterval, config, setMonitoring, addTransferRecord, addLog, setError])

  // 检查网络连接状态
  const checkNetworkStatus = useCallback(async () => {
    try {
      setNetworkStatus('checking')
      // 尝试获取Gas价格来检查网络连接
      await blockchainService.getGasPrice()
      setNetworkStatus('connected')
    } catch (error) {
      console.warn('网络连接检查失败:', error)
      setNetworkStatus('disconnected')
    }
  }, [])

  // 页面加载完成后只检查网络连接，不自动刷新余额
  useEffect(() => {
    const initializePage = async () => {
      // 只检查网络连接，不自动刷新余额
      await checkNetworkStatus()
      setIsPageLoading(false)
    }

    initializePage()
  }, [checkNetworkStatus])

  // 清理监控定时器
  useEffect(() => {
    return () => {
      if (monitoringInterval) {
        clearInterval(monitoringInterval)
        setMonitoringInterval(null)
      }
      // 页面卸载时停止监控（不影响协议监控）
      if (isMonitoring) {
        setMonitoring(false)
      }
    }
  }, [monitoringInterval, isMonitoring, setMonitoring])

  // 格式化时间
  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date)
  }

  // 页面加载状态
  if (isPageLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">正在加载监控页面...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 密码输入对话框 */}
      {showPasswordInput && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-blue-500" />
            <span className="text-sm font-medium text-blue-800">需要密码</span>
          </div>
          <p className="text-sm text-blue-700 mt-1">
            您的私钥受密码保护，请输入密码来解锁钱包
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="password"
              placeholder="输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handlePasswordSubmit}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              解锁
            </button>
            <button
              onClick={() => {
                setShowPasswordInput(false)
                setPassword('')
                setLocalError(null)
              }}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span className="text-sm font-medium text-red-800">错误</span>
          </div>
          <p className="text-sm text-red-700 mt-1">{error}</p>
          <button
            onClick={() => setLocalError(null)}
            className="text-sm text-red-600 hover:text-red-800 mt-2 underline"
          >
            关闭
          </button>
        </div>
      )}

      {/* 钱包状态 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Wallet className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold text-gray-900">钱包状态</h2>
          </div>
          <div className="flex items-center gap-2">
            {/* 网络状态指示器 */}
            <div className="flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-gray-100">
              <div className={`w-2 h-2 rounded-full ${
                networkStatus === 'connected' ? 'bg-green-500' :
                networkStatus === 'disconnected' ? 'bg-red-500' :
                'bg-yellow-500 animate-pulse'
              }`} />
              <span className="text-gray-600">
                {networkStatus === 'connected' ? '网络正常' :
                 networkStatus === 'disconnected' ? '网络断开' :
                 '检查中...'}
              </span>
              {networkStatus === 'disconnected' && (
                <button
                  onClick={checkNetworkStatus}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  重试
                </button>
              )}
            </div>
            
            {/* 疯狂抢救模式切换按钮 */}
            {config.autoTransfer && (
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
              <div className={`w-2 h-2 rounded-full ${
                contractValidationStatus?.isValid ? 'bg-green-500' : 
                contractValidationStatus && !contractValidationStatus.isValid ? 'bg-red-500' : 'bg-yellow-500'
              }`} />
              <span className="text-gray-600">
                {contractValidationStatus?.isValid ? '合约已验证' : 
                 contractValidationStatus && !contractValidationStatus.isValid ? '合约无效' : '合约未验证'}
              </span>
              <button
                onClick={checkContractValidationStatus}
                disabled={isCheckingContractStatus}
                className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCheckingContractStatus ? '检查中...' : '检查'}
              </button>
            </div>
            
          <button
            onClick={refreshBalance}
              disabled={isRefreshing || !config.isConfigured || networkStatus === 'disconnected'}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            onClick={() => {
              clearWalletStatus()
              setDaiBalance('0')
              setLastBalanceUpdate(null)
              // 强制清除所有缓存
              rpcOptimizer.clearCache()
              addLog({
                level: 'info',
                category: 'system',
                message: '余额已清除',
                details: '已清除所有余额缓存'
              })
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
            清除余额
          </button>
          </div>
        </div>

        {config.isConfigured ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-700">钱包地址</span>
                <Wallet className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-sm font-mono text-blue-900 mt-1 break-all">
                {walletStatus?.address || '未连接'}
              </p>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-green-700">当前余额</span>
                <Activity className="w-4 h-4 text-green-500" />
              </div>
              <p className="text-lg font-semibold text-green-900 mt-1">
                {walletStatus?.balance && !isNaN(parseFloat(walletStatus.balance)) 
                  ? (() => {
                      const balance = parseFloat(walletStatus.balance)
                      const symbol = walletStatus?.tokenInfo?.symbol || 'MATIC'
                      // 根据代币类型决定显示精度
                      if (symbol === 'MATIC') {
                        return balance.toFixed(6) // MATIC显示6位小数
                      } else {
                        return balance.toFixed(4) // 其他代币显示4位小数
                      }
                    })()
                  : '0.000000'} {walletStatus?.tokenInfo?.symbol || 'MATIC'}
                <button 
                  onClick={refreshBalance}
                  className="ml-2 text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? '刷新中...' : '刷新'}
                </button>
              </p>
              {walletStatus?.balance && (
                <p className="text-xs text-green-600 mt-1">
                  余额: {walletStatus.balance} {walletStatus?.tokenInfo?.symbol || 'MATIC'}
                </p>
              )}
              {lastBalanceUpdate && (
                <p className="text-xs text-green-600 mt-1">
                  余额更新: {formatTime(lastBalanceUpdate)}
                </p>
              )}
              {walletStatus?.lastChecked && (
                <p className="text-xs text-green-600 mt-1">
                  最后检查: {formatTime(walletStatus.lastChecked)}
                </p>
              )}
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-purple-700">监控状态</span>
                <div className={`w-3 h-3 rounded-full ${
                  isMonitoring ? 'bg-green-500' : 'bg-red-500'
                }`} />
              </div>
              <p className="text-lg font-semibold text-purple-900 mt-1">
                {isMonitoring ? (config.rescueMode ? '🚨 抢救模式' : '监控中') : '已停止'}
              </p>
              {isMonitoring && (
                <p className="text-xs text-purple-600 mt-1">
                  检查间隔: {config.rescueMode ? `${config.rescueInterval}毫秒` : `${config.checkInterval || 3}秒`}
                  {config.rescueMode && (
                    <span className="ml-2 text-orange-600">
                      Gas: {config.rescueGasMultiplier}倍
                    </span>
                  )}
                </p>
              )}
              {walletStatus?.lastChecked && (
                <p className="text-xs text-gray-600 mt-1">
                  检查时间: {formatTime(walletStatus.lastChecked)}
                </p>
              )}
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-orange-700">AkasaDAO Silence</span>
                <TrendingUp className="w-4 h-4 text-orange-500" />
              </div>
              <p className="text-lg font-semibold text-orange-900 mt-1">
                {config.akasdaoEnabled ? '已启用' : '已禁用'}
              </p>
              {config.akasdaoEnabled && (
                <>
                  <p className="text-sm text-orange-800 mt-1">
                    DAI余额: {parseFloat(daiBalance).toFixed(6)} DAI
                    <button 
                      onClick={refreshDaiBalance}
                      className="ml-2 text-xs bg-orange-600 text-white px-2 py-1 rounded hover:bg-orange-700"
                      disabled={!config.isConfigured}
                    >
                      刷新
                    </button>
                  </p>
                  <p className="text-xs text-orange-600 mt-1">
                    最小金额: {config.akasdaoMinAmount || '0'} DAI
                  </p>
                </>
              )}
              {config.akasdaoEnabled && isMonitoring && (
                <p className="text-xs text-orange-600 mt-1">
                  自动监控中
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              <span className="text-sm font-medium text-yellow-800">未配置</span>
            </div>
            <p className="text-sm text-yellow-700 mt-1">
              请先在配置页面导入钱包并设置目标地址
            </p>
          </div>
        )}

        {/* 监控控制 */}
        <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-3 ${
              isMonitoring ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`} />
            <span className="text-sm font-medium text-gray-700">
              监控状态: {isMonitoring ? '运行中' : '已停止'}
            </span>
          </div>
          <div className="flex flex-col space-y-3">
            {!isMonitoring ? (
              <button
                onClick={handleToggleMonitoring}
                disabled={!config.isConfigured || networkStatus === 'disconnected'}
                className="flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4" />
                开始监控
              </button>
            ) : (
              <button
                onClick={handleToggleMonitoring}
                className="flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors duration-200"
              >
                <Pause className="w-4 h-4" />
                停止监控
              </button>
            )}
            <button
              onClick={handleManualTransfer}
              disabled={!config.isConfigured || isTransferring || !walletStatus?.balance || parseFloat(walletStatus?.balance || '0') <= parseFloat(config.minTransferAmount) || networkStatus === 'disconnected'}
              className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowRight className="w-4 h-4" />
              {isTransferring ? '转账中...' : '立即转账'}
            </button>
          </div>
        </div>
      </div>



      {/* 转账记录 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">转账记录</h2>
          <span className="text-sm text-gray-500">
            共 {transferRecords.length} 条记录
            ({transferRecords.filter((t: any) => t.status === 'confirmed').length} 已确认, 
             {transferRecords.filter((t: any) => t.status === 'pending').length} 待确认, 
             {transferRecords.filter((t: any) => t.status === 'failed').length} 失败)
          </span>
        </div>
        
        <div className="space-y-3">
          {transferRecords.length > 0 ? (
            transferRecords
              .slice(0, 10)
              .map((transfer: any) => {
                const getStatusInfo = (status: string) => {
                  switch (status) {
                    case 'confirmed':
                      return { color: 'bg-green-500', text: '成功', textColor: 'text-green-600' }
                    case 'pending':
                      return { color: 'bg-yellow-500', text: '待确认', textColor: 'text-yellow-600' }
                    case 'failed':
                      return { color: 'bg-red-500', text: '失败', textColor: 'text-red-600' }
                    default:
                      return { color: 'bg-gray-500', text: '未知', textColor: 'text-gray-600' }
                  }
                }
                
                const statusInfo = getStatusInfo(transfer.status)
                
                return (
              <div key={transfer.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${statusInfo.color}`} />
                    <div>
                      <p className="font-medium text-gray-900">
                        {transfer.amount} {transfer.tokenSymbol || 'MATIC'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatTime(transfer.timestamp)}
                      </p>
                          {transfer.error && (
                            <p className="text-xs text-red-500 mt-1">
                              错误: {transfer.error}
                            </p>
                          )}
                    </div>
                  </div>
                  
                  <div className="text-right">
                        <p className={`text-sm font-medium ${statusInfo.textColor}`}>
                          {statusInfo.text}
                    </p>
                    {transfer.txHash && (
                      <a
                        href={`https://polygonscan.com/tx/${transfer.txHash}`}
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
                  </div>
                )
              })
          ) : (
            <div className="text-center text-gray-500 py-8">
              <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>暂无转账记录</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}