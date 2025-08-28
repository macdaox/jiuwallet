import { useState, useEffect, useCallback } from 'react'
import { Wallet, Shield, Settings, CheckCircle, AlertCircle, Coins, Lock, Unlock, Key } from 'lucide-react'
import { useWalletStore } from '../store/useWalletStore'
import { blockchainService } from '../utils/blockchain'
import { 
  storePrivateKey, 
  getPrivateKey, 
  hasStoredPrivateKey, 
  isPrivateKeyProtected, 
  getPrivateKeyImportTime,
  clearPrivateKey,
  validatePrivateKey, 
  validateAddress, 
  formatAddress 
} from '../utils/encryption'

export function ConfigPage() {
  const { config, setConfig, walletStatus, setWalletStatus, addLog, setError, error } = useWalletStore()
  const [privateKey, setPrivateKey] = useState('')
  const [password, setPassword] = useState('')
  const [usePassword, setUsePassword] = useState(false)
  const [targetAddress, setTargetAddress] = useState(config.targetAddress)
  const [minTransferAmount, setMinTransferAmount] = useState(config.minTransferAmount)
  const [gasStrategy, setGasStrategy] = useState<'fast' | 'standard' | 'safe' | 'custom'>(config.gasStrategy)
  const [gasMultiplier, setGasMultiplier] = useState(config.gasMultiplier || 1)
  const [gasLimit, setGasLimit] = useState(config.gasLimit || '')
  const [crazyMode, setCrazyMode] = useState(config.crazyMode || false)
  const [autoTransfer, setAutoTransfer] = useState(config.autoTransfer || false)
  const [transferType, setTransferType] = useState<'native' | 'token'>(config.transferType)
  const [tokenAddress, setTokenAddress] = useState(config.tokenAddress || '')
  const [tokenInfo, setTokenInfo] = useState<{name: string; symbol: string; decimals: number} | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [isValidatingToken, setIsValidatingToken] = useState(false)
  const [hasStoredKey, setHasStoredKey] = useState(false)
  const [isKeyProtected, setIsKeyProtected] = useState(false)
  const [keyImportTime, setKeyImportTime] = useState<Date | null>(null)
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  const [networkStatus, setNetworkStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking')


  useEffect(() => {
    setTargetAddress(config.targetAddress)
    setMinTransferAmount(config.minTransferAmount)
    setGasStrategy(config.gasStrategy)
    setGasMultiplier(config.gasMultiplier || 1)
    setGasLimit(config.gasLimit || '')
    setCrazyMode(config.crazyMode || false)
    setAutoTransfer(config.autoTransfer || false)
    
    // 只在transferType未设置时才从config恢复
    if (!transferType) {
      setTransferType(config.transferType)
    }
    
    // 检查是否有已存储的私钥
    setHasStoredKey(hasStoredPrivateKey())
    setIsKeyProtected(isPrivateKeyProtected())
    setKeyImportTime(getPrivateKeyImportTime())
  }, [config, transferType])

  // 单独处理tokenAddress的初始化，避免覆盖用户输入
  useEffect(() => {
    // 只在tokenAddress为空且config中有tokenAddress时才恢复
    if (!tokenAddress && config.tokenAddress) {
      setTokenAddress(config.tokenAddress)
    }
  }, [config.tokenAddress]) // 移除tokenAddress依赖，避免循环

  // 当tokenAddress改变时，自动验证（如果地址格式正确）
  useEffect(() => {
    if (tokenAddress && validateAddress(tokenAddress)) {
      // 使用防抖，避免频繁验证
      const timer = setTimeout(() => {
        validateTokenAddress(tokenAddress)
      }, 1000)
      
      return () => clearTimeout(timer)
    } else if (!tokenAddress) {
      setTokenInfo(null)
    }
  }, [tokenAddress])

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

  // 页面加载时检查网络状态
  useEffect(() => {
    checkNetworkStatus()
  }, [checkNetworkStatus])

  // 尝试恢复已存储的私钥
  const handleRestoreWallet = async () => {
    if (!hasStoredKey) return

    setIsImporting(true)
    setError(null)

    try {
      let storedPrivateKey: string | null = null

      if (isKeyProtected) {
        // 需要密码解密
        if (!password.trim()) {
          setError('请输入密码来解密私钥')
          return
        }
        storedPrivateKey = getPrivateKey(password)
      } else {
        // 直接获取
        storedPrivateKey = getPrivateKey()
      }

      if (!storedPrivateKey) {
        setError('无法获取私钥，请检查密码是否正确')
        return
      }

      // 初始化钱包
      const address = await blockchainService.initializeWallet(storedPrivateKey)
      
      // 获取余额
      const balance = await blockchainService.getBalance()
      
      // 更新钱包状态
      setWalletStatus({
        address,
        balance,
        lastChecked: new Date()
      })
      
      // 更新配置
      setConfig({
        privateKey: storedPrivateKey,
        isConfigured: true
      })
      
      addLog({
        level: 'success',
        category: 'system',
        message: '钱包恢复成功',
        details: `地址: ${address}, 余额: ${balance} MATIC`
      })
      
      // 清空密码
      setPassword('')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '钱包恢复失败'
      setError(errorMessage)
      addLog({
        level: 'error',
        category: 'system',
        message: '钱包恢复失败',
        details: errorMessage
      })
    } finally {
      setIsImporting(false)
    }
  }

  // 清除已存储的私钥
  const handleClearStoredKey = () => {
    clearPrivateKey()
    setHasStoredKey(false)
    setIsKeyProtected(false)
    setKeyImportTime(null)
    setPassword('')
    addLog({
      level: 'info',
      category: 'system',
      message: '已清除存储的私钥'
    })
  }

  const handleImportWallet = async () => {
    if (!privateKey.trim()) {
      setError('请输入私钥')
      return
    }

    if (!validatePrivateKey(privateKey)) {
      setError('私钥格式无效')
      setImportStatus('error')
      return
    }

    if (usePassword && !password.trim()) {
      setError('请输入密码保护私钥')
      setImportStatus('error')
      return
    }

    setIsImporting(true)
    setImportStatus('idle')
    setError(null)

    try {
      // 初始化钱包
      const address = await blockchainService.initializeWallet(privateKey)
      
      // 获取余额
      const balance = await blockchainService.getBalance()
      
      // 存储加密的私钥
      storePrivateKey(privateKey, usePassword ? password : undefined)
      
      // 更新钱包状态
      setWalletStatus({
        address,
        balance,
        lastChecked: new Date()
      })
      
      // 更新配置
      setConfig({
        privateKey: privateKey,
        isConfigured: true
      })
      
      // 更新状态
      setHasStoredKey(true)
      setIsKeyProtected(usePassword)
      setKeyImportTime(new Date())
      
      setImportStatus('success')
      addLog({
        level: 'success',
        category: 'system',
        message: '钱包导入成功',
        details: `地址: ${address}, 余额: ${balance} MATIC, ${usePassword ? '已启用密码保护' : '未启用密码保护'}`
      })
      
      // 清空输入框
      setPrivateKey('')
      setPassword('')
      setUsePassword(false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '钱包导入失败'
      setError(errorMessage)
      setImportStatus('error')
      addLog({
        level: 'error',
        category: 'system',
        message: '钱包导入失败',
        details: errorMessage
      })
    } finally {
      setIsImporting(false)
    }
  }

  // 验证代币合约地址
  const validateTokenAddress = async (address: string) => {
    if (!address.trim()) {
      setTokenInfo(null)
      return
    }

    if (!validateAddress(address)) {
      setError('代币合约地址格式无效')
      setTokenInfo(null)
      return
    }

    setIsValidatingToken(true)
    setError(null)

    try {
      const info = await blockchainService.getTokenInfo(address)
      setTokenInfo(info)
      addLog({
        level: 'success',
        category: 'system',
        message: '代币信息获取成功',
        details: `${info.name} (${info.symbol}), 精度: ${info.decimals}`
      })
    } catch (error) {
      setError('无法获取代币信息，请检查合约地址是否正确')
      setTokenInfo(null)
      addLog({
        level: 'error',
        category: 'system',
        message: '代币信息获取失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    } finally {
      setIsValidatingToken(false)
    }
  }

  const handleSaveConfig = () => {
    if (!targetAddress.trim()) {
      setError('请输入目标地址')
      return
    }

    if (!validateAddress(targetAddress)) {
      setError('目标地址格式无效')
      return
    }

    if (transferType === 'token') {
      if (!tokenAddress.trim()) {
        setError('请输入代币合约地址')
        return
      }
      if (!validateAddress(tokenAddress)) {
        setError('代币合约地址格式无效')
        return
      }
      if (!tokenInfo) {
        setError('请先验证代币合约地址')
        return
      }
    }

    const numAmount = parseFloat(minTransferAmount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('最小转账金额必须大于0')
      return
    }

    setError(null)
    
    // 保存配置
    const configData: any = {
      targetAddress: formatAddress(targetAddress),
      minTransferAmount,
      gasStrategy,
      autoTransfer,
      transferType
    }

    // 添加自定义Gas配置
    if (gasStrategy === 'custom') {
      configData.gasMultiplier = gasMultiplier
      configData.gasLimit = gasLimit
      configData.crazyMode = crazyMode
    }

    if (transferType === 'token') {
      configData.tokenAddress = formatAddress(tokenAddress)
    }

    setConfig(configData)

    const currency = transferType === 'token' ? (tokenInfo?.symbol || 'TOKEN') : 'MATIC'
    addLog({
      level: 'success',
      category: 'system',
      message: '配置保存成功',
      details: `目标地址: ${targetAddress}, 最小金额: ${minTransferAmount} ${currency}, Gas策略: ${gasStrategy}, 转账类型: ${transferType === 'native' ? '原生MATIC' : '代币'}`
    })

    // 显示成功提示
    setShowSaveSuccess(true)
    setTimeout(() => setShowSaveSuccess(false), 3000) // 3秒后自动隐藏
  }

  return (
    <div className="space-y-8">
      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-sm font-medium text-red-800">错误</span>
          </div>
          <p className="text-sm text-red-700 mt-1">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-sm text-red-600 hover:text-red-800 mt-2 underline"
          >
            关闭
          </button>
        </div>
      )}


      {/* 钱包导入 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-3 mb-6">
          <Wallet className="w-6 h-6 text-primary-600" />
          <h2 className="text-xl font-semibold text-gray-900">钱包导入</h2>
          <div className="flex items-center gap-2 ml-auto">
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
            
            {/* 钱包连接状态 */}
            {walletStatus?.address && (
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-sm text-green-600">已连接</span>
              </div>
            )}
          </div>
        </div>
        
        {/* 已存储的私钥信息 */}
        {hasStoredKey && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-blue-800">已存储私钥</span>
                {isKeyProtected && <Lock className="w-4 h-4 text-orange-500" />}
                {!isKeyProtected && <Unlock className="w-4 h-4 text-green-500" />}
              </div>
              <button
                onClick={handleClearStoredKey}
                className="text-xs text-red-600 hover:text-red-800 underline"
              >
                清除
              </button>
            </div>
            <p className="text-sm text-blue-700">
              {isKeyProtected ? '密码保护已启用' : '密码保护未启用'}
              {keyImportTime && ` • 导入时间: ${keyImportTime.toLocaleString()}`}
            </p>
            {!walletStatus?.address && (
              <button
                onClick={handleRestoreWallet}
                disabled={isImporting}
                className="mt-2 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                恢复钱包
              </button>
            )}
          </div>
        )}

        {walletStatus?.address && (
          <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-green-800">钱包已连接</span>
              </div>
              <button
                onClick={async () => {
                  try {
                    const balance = await blockchainService.getBalance()
                    // 更新store中的余额数据
                    setWalletStatus({
                      ...walletStatus,
                      balance,
                      lastChecked: new Date()
                    })
                    addLog({
                      level: 'success',
                      category: 'system',
                      message: '余额刷新成功',
                      details: `当前余额: ${balance} ${walletStatus?.tokenInfo?.symbol || 'MATIC'}`
                    })
                  } catch (error) {
                    addLog({
                      level: 'error',
                      category: 'system',
                      message: '余额刷新失败',
                      details: error instanceof Error ? error.message : '未知错误'
                    })
                  }
                }}
                className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 transition-colors"
              >
                刷新余额
              </button>
            </div>
            <p className="text-sm text-green-700">地址: {walletStatus?.address}</p>
            <p className="text-sm text-green-700">余额: {walletStatus?.balance || '0'} {walletStatus?.tokenInfo?.symbol || 'MATIC'}</p>
          </div>
        )}
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              私钥
            </label>
            <input
              type="password"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="输入钱包私钥"
              disabled={isImporting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            {importStatus === 'error' && (
              <div className="flex items-center gap-2 mt-2 text-red-600">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">私钥格式无效</span>
              </div>
            )}
          </div>

          {/* 密码保护选项 */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={usePassword}
                onChange={(e) => setUsePassword(e.target.checked)}
                className="rounded"
              />
              <Lock className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-gray-700">启用密码保护</span>
            </label>
          </div>

          {usePassword && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                保护密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码保护私钥"
                disabled={isImporting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                密码将用于加密私钥，请妥善保管
              </p>
            </div>
          )}

          {/* 恢复已存储私钥的密码输入 */}
          {hasStoredKey && isKeyProtected && !walletStatus?.address && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                解密密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码解密私钥"
                disabled={isImporting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
          )}
          
          <div className="flex gap-2">
            <button
              onClick={handleImportWallet}
              disabled={isImporting || !privateKey.trim() || (usePassword && !password.trim())}
              className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isImporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  导入中...
                </>
              ) : (
                '导入钱包'
              )}
            </button>

            {hasStoredKey && !walletStatus?.address && (
              <button
                onClick={handleRestoreWallet}
                disabled={isImporting || (isKeyProtected && !password.trim())}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isImporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    恢复中...
                  </>
                ) : (
                  '恢复钱包'
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 安全钱包设置 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-6 h-6 text-green-600" />
          <h2 className="text-xl font-semibold text-gray-900">安全钱包设置</h2>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              转账类型
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="native"
                  checked={transferType === 'native'}
                  onChange={(e) => {
                    setTransferType(e.target.value as 'native' | 'token')
                    // 如果切换到native类型，清空tokenAddress
                    if (e.target.value === 'native') {
                      setTokenAddress('')
                      setTokenInfo(null)
                    }
                  }}
                  className="mr-2"
                />
                <Wallet className="w-4 h-4 mr-1" />
                原生MATIC
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="token"
                  checked={transferType === 'token'}
                  onChange={(e) => {
                    setTransferType(e.target.value as 'native' | 'token')
                    // 如果切换到token类型，清空之前的tokenAddress
                    if (e.target.value === 'token') {
                      setTokenAddress('')
                      setTokenInfo(null)
                    }
                  }}
                  className="mr-2"
                />
                <Coins className="w-4 h-4 mr-1" />
                ERC-20代币
              </label>
            </div>
          </div>

          {transferType === 'token' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                代币合约地址
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={tokenAddress}
                  onChange={(e) => setTokenAddress(e.target.value)}
                  placeholder="输入ERC-20代币合约地址"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => validateTokenAddress(tokenAddress)}
                  disabled={isValidatingToken || !tokenAddress.trim()}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isValidatingToken ? '验证中...' : '验证'}
                </button>
              </div>
              {tokenInfo && (
                <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                  <div className="flex items-center text-green-800">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    <span className="font-medium">{tokenInfo.name} ({tokenInfo.symbol})</span>
                  </div>
                  <p className="text-sm text-green-600 mt-1">精度: {tokenInfo.decimals} 位小数</p>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              目标地址
            </label>
            <input
              type="text"
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
              placeholder="输入安全钱包地址"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              资金将自动转移到此地址
            </p>
          </div>
        </div>
      </div>

      {/* 监控参数设置 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">监控参数设置</h2>
        </div>
        
        {/* 自动转账开关 */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={autoTransfer}
              onChange={(e) => setAutoTransfer(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-blue-800">启用自动转账</span>
              <p className="text-xs text-blue-600">
                监控到代币后立即按最大数额自动转账（扣除Gas费后的全部余额）
              </p>
            </div>
          </label>
          
          {/* 疯狂抢救模式配置 */}
          {autoTransfer && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={config.rescueMode}
                  onChange={(e) => setConfig({ rescueMode: e.target.checked })}
                  className="w-4 h-4 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500"
                />
                <div>
                  <span className="text-sm font-medium text-red-800">🚨 疯狂抢救模式</span>
                  <p className="text-xs text-red-600">
                    启用毫秒级监控，每100毫秒检查一次余额变化，与骗子抢时间！
                  </p>
                </div>
              </label>
              
              {config.rescueMode && (
                <div className="mt-3 p-3 bg-red-100 border border-red-300 rounded-md">
                  <div className="flex items-center gap-2 text-red-800 mb-2">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-bold">疯狂抢救模式已启用</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-red-700 mb-1">
                        检查间隔 (毫秒)
                      </label>
                      <input
                        type="number"
                        value={config.rescueInterval}
                        onChange={(e) => setConfig({ rescueInterval: parseInt(e.target.value) || 100 })}
                        min="50"
                        max="1000"
                        step="50"
                        className="w-full px-2 py-1 text-sm border border-red-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                      <p className="text-xs text-red-600 mt-1">
                        建议: 50-200毫秒，越快越容易抢到
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-red-700 mb-1">
                        ⚡ 极速检查间隔 (秒)
                      </label>
                      <input
                        type="number"
                        value={config.checkInterval}
                        onChange={(e) => setConfig({ checkInterval: parseFloat(e.target.value) || 0.5 })}
                        min="0.1"
                        max="60"
                        step="0.1"
                        className="w-full px-2 py-1 text-sm border border-red-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                      <p className="text-xs text-red-600 mt-1">
                        检查间隔 (秒) - 越小越频繁，默认0.5秒，最小0.1秒
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-red-700 mb-1">
                        🚀 抢救Gas倍数
                      </label>
                      <input
                        type="number"
                        value={config.rescueGasMultiplier}
                        onChange={(e) => setConfig({ rescueGasMultiplier: parseFloat(e.target.value) || 3 })}
                        min="1"
                        max="10"
                        step="0.5"
                        className="w-full px-2 py-1 text-sm border border-red-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                      <p className="text-xs text-red-600 mt-1">
                        建议: 2-5倍，越高越容易成功
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 p-2 bg-red-200 rounded text-xs text-red-800">
                    <p className="font-bold mb-1">⚠️ 疯狂抢救模式说明:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>每{config.rescueInterval}毫秒检查一次余额</li>
                      <li>检测到余额立即执行转账</li>
                      <li>使用{config.rescueGasMultiplier}倍Gas费用确保交易成功</li>
                      <li>消耗更多CPU和网络资源</li>
                      <li>建议只在紧急抢救时使用</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {autoTransfer && (
            <div className="mt-2 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-6 h-6 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-700">
                  <p className="font-bold mb-2 text-red-800">⚠️ 重要安全警告</p>
                  <p className="mb-2 font-medium">启用自动最大数额转账功能存在以下风险:</p>
                  <ul className="list-disc list-inside space-y-1 mb-3">
                    <li><strong>资金风险:</strong> 系统将自动转出所有可用余额（扣除Gas费）</li>
                    <li><strong>即时执行:</strong> 检测到余额变化后立即执行，无法撤销</li>
                    <li><strong>网络风险:</strong> 网络拥堵可能导致高额Gas费用</li>
                    <li><strong>地址风险:</strong> 目标地址错误将导致资金永久丢失</li>
                  </ul>
                  <div className="bg-red-100 p-2 rounded border border-red-300">
                    <p className="font-medium text-red-800 mb-1">使用前请确认:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>目标地址已多次验证无误</li>
                      <li>私钥安全且未泄露</li>
                      <li>网络环境稳定可靠</li>
                      <li>充分了解自动转账风险</li>
                      <li>建议先小额测试验证功能</li>
                    </ul>
                  </div>
                  <p className="mt-2 text-xs text-red-600 font-medium">
                    💡 提示: 建议在测试网络上先验证功能正常后再在主网使用
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              最小转账金额 ({transferType === 'token' ? (tokenInfo?.symbol || 'TOKEN') : 'MATIC'})
            </label>
            <input
              type="number"
              value={minTransferAmount}
              onChange={(e) => setMinTransferAmount(e.target.value)}
              placeholder="0.001"
              step="0.001"
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              {autoTransfer ? '触发自动最大数额转账的最小余额阈值' : '只有余额超过此金额时才会触发转账'}
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Gas费策略
            </label>
            <select
              value={gasStrategy}
              onChange={(e) => setGasStrategy(e.target.value as 'fast' | 'standard' | 'safe' | 'custom')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="safe">安全 (低Gas费)</option>
              <option value="standard">标准 (中等Gas费)</option>
              <option value="fast">快速 (高Gas费)</option>
              <option value="custom">自定义 (抢币模式)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {gasStrategy === 'custom' ? '自定义模式可以设置极高Gas费来抢占交易时间' : '快速模式可以更快完成转账，但费用更高'}
            </p>
          </div>
        </div>
        
        {/* 自定义Gas配置 */}
        {gasStrategy === 'custom' && (
          <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <h3 className="text-lg font-medium text-orange-800 mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              自定义Gas配置 (抢币模式)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Gas价格倍数滑块 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Gas价格倍数: {gasMultiplier}x
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={gasMultiplier}
                  onChange={(e) => setGasMultiplier(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1x (标准)</span>
                  <span>5.5x</span>
                  <span>10x (极限)</span>
                </div>
                <p className="text-xs text-orange-600 mt-1">
                  倍数越高，交易越容易被优先处理
                </p>
              </div>
              
              {/* Gas限制设置 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Gas限制 (可选)
                </label>
                <input
                  type="number"
                  value={gasLimit}
                  onChange={(e) => setGasLimit(e.target.value)}
                  placeholder="留空使用自动估算"
                  min="21000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  手动设置Gas限制，留空则自动估算
                </p>
              </div>
            </div>
            
            {/* 疯狂模式开关 */}
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={crazyMode}
                  onChange={(e) => setCrazyMode(e.target.checked)}
                  className="w-4 h-4 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500"
                />
                <div>
                  <span className="text-sm font-medium text-red-800">疯狂模式</span>
                  <p className="text-xs text-red-600">
                    启用后将使用5-10倍市场价格的极高Gas费，确保交易优先执行
                  </p>
                </div>
              </label>
            </div>
            
            {crazyMode && (
              <div className="mt-3 p-3 bg-red-100 border border-red-300 rounded-md">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm font-bold">警告：疯狂模式已启用</span>
                </div>
                <p className="text-xs text-red-700 mt-1">
                  此模式将消耗大量Gas费用，请确保钱包有足够余额支付高额手续费
                </p>
              </div>
            )}
          </div>
        )}
        
        <div className="mt-6">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveConfig}
              className="bg-accent-600 text-white px-6 py-2 rounded-md hover:bg-accent-700 transition-colors flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              保存配置
            </button>
            
            {/* 成功提示 - 显示在按钮旁边 */}
            {showSaveSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-md px-3 py-2 animate-fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium text-green-800">保存成功</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}