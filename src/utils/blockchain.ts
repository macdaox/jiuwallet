import { ethers } from 'ethers'
import { formatPrivateKey, formatAddress } from './encryption'
import { rpcOptimizer } from './rpcOptimizer'

// Polygon网络配置
const POLYGON_RPC_URL = 'https://polygon-rpc.com'
const POLYGON_CHAIN_ID = 137

// 网络请求配置
const REQUEST_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 基础延迟1秒
  maxDelay: 30000, // 最大延迟30秒
  timeout: 10000,  // 请求超时10秒
  minInterval: 500 // 最小请求间隔500ms
}


// ERC-20代币合约ABI
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)'
]

// ERC-20代币信息接口
export interface TokenInfo {
  address: string
  name: string
  symbol: string
  decimals: number
}

// ERC-20代币余额接口
export interface TokenBalance {
  address: string
  balance: string
  formattedBalance: string
  tokenInfo: TokenInfo
}

// Gas费策略配置
const GAS_STRATEGIES = {
  fast: 1.5,
  standard: 1.2,
  safe: 1.0,
  custom: 1.0 // 自定义策略的基础倍数，实际倍数由用户设置
}

// 自定义Gas配置接口
export interface CustomGasConfig {
  gasMultiplier: number // Gas价格倍数 (1-10)
  gasLimit?: bigint // 自定义Gas限制
  crazyMode: boolean // 疯狂模式 (5-10倍市场价格)
}

export interface GasEstimate {
  gasLimit: bigint
  gasPrice: bigint
  maxFeePerGas?: bigint
  maxPriorityFeePerGas?: bigint
  totalCost: bigint
}

export interface TransactionResult {
  hash: string
  success: boolean
  gasUsed?: bigint
  gasPrice?: bigint
  error?: string
}

class BlockchainService {
  private provider: ethers.JsonRpcProvider
  private wallet: ethers.Wallet | null = null
  private lastRequestTime = 0
  private requestCount = 0
  private rateLimitResetTime = 0

  constructor() {
    // 使用优化的RPC提供者
    this.provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL)
  }



  // 初始化钱包
  async initializeWallet(privateKey: string): Promise<string> {
    try {
      const formattedKey = formatPrivateKey(privateKey)
      this.wallet = new ethers.Wallet(formattedKey, this.provider)
      return this.wallet.address
    } catch (error) {
      console.error('钱包初始化失败:', error)
      throw new Error('无效的私钥')
    }
  }

  // 获取钱包地址
  getWalletAddress(): string | null {
    return this.wallet?.address || null
  }

  // 获取provider
  getProvider(): ethers.JsonRpcProvider {
    return this.provider
  }

  // 切换RPC节点（使用优化器）
  private async switchRpcNode(): Promise<void> {
    console.log(`🔄 使用RPC优化器切换节点`)
    // RPC优化器会自动处理节点切换
  }

  // 检查是否需要等待（频率限制）
  private async checkRateLimit(): Promise<void> {
    const now = Date.now()
    
    // 如果还在限制时间内，需要等待
    if (now < this.rateLimitResetTime) {
      const waitTime = this.rateLimitResetTime - now
      console.log(`⏳ 频率限制中，等待 ${Math.ceil(waitTime / 1000)} 秒...`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
    
    // 确保请求间隔不小于最小间隔
    if (this.lastRequestTime > 0) {
      const timeSinceLastRequest = now - this.lastRequestTime
      if (timeSinceLastRequest < REQUEST_CONFIG.minInterval) {
        const waitTime = REQUEST_CONFIG.minInterval - timeSinceLastRequest
        console.log(`⏳ 请求间隔控制，等待 ${waitTime}ms...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
    
    // 重置计数器
    if (now - this.lastRequestTime > 60000) { // 1分钟重置
      this.requestCount = 0
    }
    
    this.lastRequestTime = Date.now()
    this.requestCount++
  }

  // 指数退避重试机制
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    retryCount = 0
  ): Promise<T> {
    try {
      await this.checkRateLimit()
      return await operation()
    } catch (error) {
      const isRateLimitError = this.isRateLimitError(error)
      
      if (isRateLimitError && retryCount < REQUEST_CONFIG.maxRetries) {
        // 计算退避延迟
        const delay = Math.min(
          REQUEST_CONFIG.baseDelay * Math.pow(2, retryCount),
          REQUEST_CONFIG.maxDelay
        )
        
        console.log(`🔄 频率限制错误，${delay / 1000}秒后重试 (${retryCount + 1}/${REQUEST_CONFIG.maxRetries})`)
        
        // 切换到备用RPC节点
        await this.switchRpcNode()
        
        // 等待退避时间
        await new Promise(resolve => setTimeout(resolve, delay))
        
        // 递归重试
        return this.retryWithBackoff(operation, retryCount + 1)
      }
      
      // 如果是频率限制错误但已达到最大重试次数
      if (isRateLimitError) {
        console.error('❌ 达到最大重试次数，频率限制错误')
        throw new Error('API请求频率过高，请稍后再试')
      }
      
      throw error
    }
  }

  // 检查是否为频率限制错误
  private isRateLimitError(error: any): boolean {
    if (!(error instanceof Error)) return false
    
    const errorMessage = error.message.toLowerCase()
    const errorCode = (error as any).code?.toString() || ''
    
    return (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') ||
      errorMessage.includes('-32090') ||
      errorCode === '-32090' ||
      errorMessage.includes('call rate limit exhausted') ||
      errorMessage.includes('retry in')
    )
  }

  // 获取余额（使用RPC优化器）
  async getBalance(address?: string): Promise<string> {
    const targetAddress = address || this.wallet?.address
    if (!targetAddress) {
      throw new Error('未指定地址且钱包未初始化')
    }

    // 强制清除所有缓存，确保获取最新余额
    rpcOptimizer.clearCache()
    
    // 使用多个RPC节点验证余额一致性
    // const balances: string[] = []
    // const errors: string[] = []
    
    try {
      // 尝试获取余额，如果失败则重试
      const balance = await rpcOptimizer.getBalance(targetAddress, 0)
      
      // 验证余额格式
      if (!balance || isNaN(parseFloat(balance))) {
        throw new Error('获取到的余额数据无效')
      }
      
      console.log(`✅ 余额查询成功: ${balance} MATIC`)
      return balance
    } catch (error) {
      console.error('余额查询失败:', error)
      throw error
    }
  }

  // 获取ERC-20代币信息（使用RPC优化器）
  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    // 验证地址格式
    if (!ethers.isAddress(tokenAddress)) {
      throw new Error('无效的代币合约地址')
    }

    const tokenInfo = await rpcOptimizer.getTokenInfo(tokenAddress)
    return {
      address: tokenAddress,
      ...tokenInfo
    }
  }

  // 获取ERC-20代币余额（使用RPC优化器）
  async getTokenBalance(tokenAddress: string, address?: string): Promise<TokenBalance> {
    const targetAddress = address || this.wallet?.address
    if (!targetAddress) {
      throw new Error('未指定地址且钱包未初始化')
    }

    // 验证地址格式
    if (!ethers.isAddress(tokenAddress)) {
      throw new Error('无效的代币合约地址')
    }

    if (!ethers.isAddress(targetAddress)) {
      throw new Error('无效的钱包地址')
    }

    const [balance, tokenInfo] = await Promise.all([
      rpcOptimizer.getTokenBalance(tokenAddress, targetAddress),
      this.getTokenInfo(tokenAddress)
    ])

    const formattedBalance = ethers.formatUnits(balance, tokenInfo.decimals)

    return {
      address: tokenAddress,
      balance: balance.toString(),
      formattedBalance,
      tokenInfo
    }
  }

  // 获取当前Gas价格（使用RPC优化器）
  async getGasPrice(): Promise<bigint> {
    const feeData = await rpcOptimizer.getGasPrice()
    return feeData.gasPrice || BigInt(0)
  }

  // 估算Gas费用 - 优化版本
  async estimateGas(
    to: string,
    amount: string,
    gasStrategy: 'fast' | 'standard' | 'safe' | 'custom' = 'fast',
    customGasConfig?: CustomGasConfig
  ): Promise<GasEstimate> {
    return this.retryWithBackoff(async () => {
      if (!this.wallet) {
        throw new Error('钱包未初始化')
      }

      const value = ethers.parseEther(amount)
      
      // 并行获取Gas限制和费用数据
      const [gasLimit, feeData] = await Promise.all([
        this.provider.estimateGas({
          from: this.wallet.address,
          to: formatAddress(to),
          value
        }),
        this.provider.getFeeData()
      ])

      // 计算Gas倍数
      let multiplier = GAS_STRATEGIES[gasStrategy]
      if (gasStrategy === 'custom' && customGasConfig) {
        multiplier = customGasConfig.crazyMode 
          ? Math.max(customGasConfig.gasMultiplier, 5) // 疯狂模式最少5倍
          : customGasConfig.gasMultiplier
      }

      // 使用自定义Gas限制（如果提供）
      const finalGasLimit = (gasStrategy === 'custom' && customGasConfig?.gasLimit) 
        ? customGasConfig.gasLimit 
        : gasLimit

      // 支持EIP-1559的动态费用
      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        const maxFeePerGas = BigInt(Math.floor(Number(feeData.maxFeePerGas) * multiplier))
        const maxPriorityFeePerGas = BigInt(Math.floor(Number(feeData.maxPriorityFeePerGas) * multiplier))
        const totalCost = finalGasLimit * maxFeePerGas

        return {
          gasLimit: finalGasLimit,
          gasPrice: maxFeePerGas,
          maxFeePerGas,
          maxPriorityFeePerGas,
          totalCost
        }
      } else {
        // 传统Gas价格
        const baseGasPrice = feeData.gasPrice || BigInt(0)
        const gasPrice = BigInt(Math.floor(Number(baseGasPrice) * multiplier))
        const totalCost = finalGasLimit * gasPrice

        return {
          gasLimit: finalGasLimit,
          gasPrice,
          totalCost
        }
      }
    })
  }

  // 估算ERC-20代币转账Gas费用
  async estimateTokenGas(
    tokenAddress: string,
    to: string,
    amount: string,
    gasStrategy: 'fast' | 'standard' | 'safe' | 'custom' = 'fast',
    customGasConfig?: CustomGasConfig
  ): Promise<GasEstimate> {
    try {
      if (!this.wallet) {
        throw new Error('钱包未初始化')
      }

      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.wallet)
      const tokenInfo = await this.getTokenInfo(tokenAddress)
      const value = ethers.parseUnits(amount, tokenInfo.decimals)
      
      // 并行获取Gas限制和费用数据
      const [gasLimit, feeData] = await Promise.all([
        contract.transfer.estimateGas(formatAddress(to), value),
        this.provider.getFeeData()
      ])

      // 计算Gas倍数
      let multiplier = GAS_STRATEGIES[gasStrategy]
      if (gasStrategy === 'custom' && customGasConfig) {
        multiplier = customGasConfig.crazyMode 
          ? Math.max(customGasConfig.gasMultiplier, 5) // 疯狂模式最少5倍
          : customGasConfig.gasMultiplier
      }

      // 使用自定义Gas限制（如果提供）
      const finalGasLimit = (gasStrategy === 'custom' && customGasConfig?.gasLimit) 
        ? customGasConfig.gasLimit 
        : gasLimit

      // 支持EIP-1559的动态费用
      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        const maxFeePerGas = BigInt(Math.floor(Number(feeData.maxFeePerGas) * multiplier))
        const maxPriorityFeePerGas = BigInt(Math.floor(Number(feeData.maxPriorityFeePerGas) * multiplier))
        const totalCost = finalGasLimit * maxFeePerGas

        return {
          gasLimit: finalGasLimit,
          gasPrice: maxFeePerGas,
          maxFeePerGas,
          maxPriorityFeePerGas,
          totalCost
        }
      } else {
        // 传统Gas价格
        const baseGasPrice = feeData.gasPrice || BigInt(0)
        const gasPrice = BigInt(Math.floor(Number(baseGasPrice) * multiplier))
        const totalCost = finalGasLimit * gasPrice

        return {
          gasLimit: finalGasLimit,
          gasPrice,
          totalCost
        }
      }
    } catch (error) {
      console.error('代币Gas估算失败:', error)
      throw new Error('代币Gas费用估算失败')
    }
  }

  // 获取最优Gas策略 - 新增功能
  async getOptimalGasStrategy(): Promise<{
    recommended: 'fast' | 'standard' | 'safe'
    estimates: Record<string, GasEstimate>
  }> {
    try {
      const feeData = await this.provider.getFeeData()
      const baseGasPrice = feeData.gasPrice || BigInt(0)
      
      const estimates: Record<string, GasEstimate> = {}
      const strategies: Array<'fast' | 'standard' | 'safe'> = ['safe', 'standard', 'fast']
      
      for (const strategy of strategies) {
        const multiplier = GAS_STRATEGIES[strategy]
        const gasPrice = BigInt(Math.floor(Number(baseGasPrice) * multiplier))
        const gasLimit = BigInt(21000) // 基础转账Gas限制
        
        estimates[strategy] = {
          gasLimit,
          gasPrice,
          totalCost: gasLimit * gasPrice
        }
      }
      
      // 根据网络拥堵情况推荐策略
      const networkCongestion = await this.getNetworkCongestion()
      let recommended: 'fast' | 'standard' | 'safe' = 'standard'
      
      if (networkCongestion > 0.8) {
        recommended = 'fast'
      } else if (networkCongestion < 0.3) {
        recommended = 'safe'
      }
      
      return { recommended, estimates }
    } catch (error) {
      console.error('获取最优Gas策略失败:', error)
      throw new Error('获取最优Gas策略失败')
    }
  }

  // 获取网络拥堵程度 - 新增功能
  private async getNetworkCongestion(): Promise<number> {
    try {
      const [currentBlock, gasPrice] = await Promise.all([
        this.provider.getBlock('latest'),
        this.provider.getFeeData()
      ])
      
      if (!currentBlock || !gasPrice.gasPrice) {
        return 0.5 // 默认中等拥堵
      }
      
      // 基于Gas使用率和价格计算拥堵程度
      const gasUsedRatio = Number(currentBlock.gasUsed) / Number(currentBlock.gasLimit)
      const gasPriceGwei = Number(ethers.formatUnits(gasPrice.gasPrice, 'gwei'))
      
      // 简单的拥堵算法：Gas使用率 * Gas价格权重
      const congestion = Math.min(gasUsedRatio * (gasPriceGwei / 50), 1)
      
      return congestion
    } catch (error) {
      console.error('获取网络拥堵程度失败:', error)
      return 0.5
    }
  }

  // 交易预检查 - 新增功能
  private async preflightTransaction(
    to: string,
    amount: string,
    gasStrategy: 'fast' | 'standard' | 'safe' | 'custom' = 'fast',
    customGasConfig?: CustomGasConfig
  ): Promise<{
    isValid: boolean
    warnings: string[]
    errors: string[]
    gasEstimate?: GasEstimate
  }> {
    const warnings: string[] = []
    const errors: string[] = []

    try {
      // 1. 验证钱包状态
      if (!this.wallet) {
        errors.push('钱包未初始化')
        return { isValid: false, warnings, errors }
      }

      // 2. 验证目标地址
      if (!ethers.isAddress(to)) {
        errors.push('无效的目标地址')
        return { isValid: false, warnings, errors }
      }

      // 3. 验证金额
      const value = ethers.parseEther(amount)
      if (value <= BigInt(0)) {
        errors.push('转账金额必须大于0')
        return { isValid: false, warnings, errors }
      }

      // 4. 检查目标地址是否为合约
      const code = await this.provider.getCode(to)
      const isContract = code !== '0x'
      
      if (isContract) {
        warnings.push(`目标地址是合约地址: ${to}`)
        
        // 检查合约是否支持接收ETH
        try {
          const contract = new ethers.Contract(to, ['function receive() external payable'], this.provider)
          await contract.receive.staticCall({ value: BigInt(1) })
        } catch (error) {
          warnings.push('合约可能不支持接收ETH转账')
        }
      }

      // 5. 获取Gas估算
      const gasEstimate = await this.estimateGas(to, amount, gasStrategy, customGasConfig)
      
      if (isContract) {
        // 对于合约地址，增加Gas限制
        gasEstimate.gasLimit = BigInt(Math.floor(Number(gasEstimate.gasLimit) * 1.2))
        warnings.push(`已为合约地址增加20% Gas限制`)
      }

      // 6. 检查余额
      const balance = await this.getBalance()
      const balanceWei = ethers.parseEther(balance)
      const totalRequired = value + gasEstimate.totalCost

      if (balanceWei < totalRequired) {
        errors.push(`余额不足: 需要 ${ethers.formatEther(totalRequired)} MATIC，当前余额 ${balance} MATIC`)
        return { isValid: false, warnings, errors, gasEstimate }
      }

      // 7. 检查网络状态
      try {
        await this.provider.getBlockNumber()
        const feeData = await this.provider.getFeeData()
        
        if (!feeData.gasPrice || feeData.gasPrice === BigInt(0)) {
          warnings.push('网络Gas价格异常，可能影响交易')
        }
      } catch (error) {
        warnings.push('无法获取网络状态信息')
      }

      // 8. 检查nonce
      try {
        const nonce = await this.wallet.getNonce()
        console.log(`当前nonce: ${nonce}`)
      } catch (error) {
        warnings.push('无法获取当前nonce')
      }

      return { 
        isValid: errors.length === 0, 
        warnings, 
        errors, 
        gasEstimate 
      }
    } catch (error) {
      errors.push(`预检查失败: ${error instanceof Error ? error.message : '未知错误'}`)
      return { isValid: false, warnings, errors }
    }
  }

  // 智能重试机制 - 新增功能
  private async retryTransaction<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        // 检查是否是可重试的错误
        const isRetryable = this.isRetryableError(lastError)
        
        if (!isRetryable || attempt === maxRetries) {
          throw lastError
        }
        
        // 计算延迟时间（指数退避）
        const delay = baseDelay * Math.pow(2, attempt - 1)
        console.log(`⚠️ 第${attempt}次尝试失败，${delay}ms后重试: ${lastError.message}`)
        
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    
    throw lastError
  }

  // 判断错误是否可重试
  private isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'NONCE_EXPIRED',
      'REPLACEMENT_UNDERPRICED',
      'UNPREDICTABLE_GAS_LIMIT',
      'network',
      'timeout',
      'rate limit',
      'temporary'
    ]
    
    const errorMessage = error.message.toLowerCase()
    return retryableErrors.some(keyword => errorMessage.includes(keyword.toLowerCase()))
  }

  // 发送交易 - 优化版本，增强错误处理
  async sendTransaction(
    to: string,
    amount: string,
    gasStrategy: 'fast' | 'standard' | 'safe' | 'custom' = 'fast',
    customGasConfig?: CustomGasConfig
  ): Promise<TransactionResult> {
    return this.retryTransaction(async () => {
      try {
        // 执行预检查
        const preflight = await this.preflightTransaction(to, amount, gasStrategy, customGasConfig)
        
        if (!preflight.isValid) {
          throw new Error(`交易预检查失败: ${preflight.errors.join(', ')}`)
        }

        // 显示警告信息
        if (preflight.warnings.length > 0) {
          console.log('⚠️ 交易警告:', preflight.warnings.join(', '))
        }

        const gasEstimate = preflight.gasEstimate!
        const value = ethers.parseEther(amount)

        // 构建交易 - 支持EIP-1559
        const transaction: any = {
          to: formatAddress(to),
          value,
          gasLimit: gasEstimate.gasLimit
        }

        // 使用EIP-1559费用结构或传统Gas价格
        if (gasEstimate.maxFeePerGas && gasEstimate.maxPriorityFeePerGas) {
          transaction.maxFeePerGas = gasEstimate.maxFeePerGas
          transaction.maxPriorityFeePerGas = gasEstimate.maxPriorityFeePerGas
          transaction.type = 2 // EIP-1559交易类型
        } else {
          transaction.gasPrice = gasEstimate.gasPrice
        }

        console.log('🚀 发送交易:', {
          to: transaction.to,
          value: ethers.formatEther(transaction.value),
          gasLimit: transaction.gasLimit.toString(),
          gasPrice: transaction.gasPrice ? ethers.formatUnits(transaction.gasPrice, 'gwei') + ' gwei' : 'EIP-1559'
        })

        // 发送交易
        const txResponse = await this.wallet!.sendTransaction(transaction)
        
        console.log(`📝 交易已发送，哈希: ${txResponse.hash}`)
        
        // 等待交易确认（最多等待3个确认）
        const receipt = await txResponse.wait(1)
        
        if (!receipt) {
          throw new Error('交易确认失败')
        }

        if (receipt.status === 0) {
          throw new Error('交易执行失败，可能被回滚')
        }

        console.log(`✅ 交易确认成功，Gas使用: ${receipt.gasUsed.toString()}`)

        return {
          hash: txResponse.hash,
          success: receipt.status === 1,
          gasUsed: receipt.gasUsed,
          gasPrice: receipt.gasPrice || gasEstimate.gasPrice
        }
      } catch (error) {
        console.error('❌ 交易发送失败:', error)
        
        // 详细错误处理
        let errorMessage = '未知错误'
        
        if (error instanceof Error) {
          errorMessage = error.message
          
          // 处理特定的错误类型
          if (errorMessage.includes('CALL_EXCEPTION')) {
            errorMessage = '合约调用失败，可能是合约地址无效或函数调用错误'
          } else if (errorMessage.includes('INSUFFICIENT_FUNDS')) {
            errorMessage = '余额不足，无法支付交易费用'
          } else if (errorMessage.includes('NONCE_EXPIRED')) {
            errorMessage = '交易nonce已过期，请重试'
          } else if (errorMessage.includes('REPLACEMENT_UNDERPRICED')) {
            errorMessage = '替换交易Gas价格过低'
          } else if (errorMessage.includes('UNPREDICTABLE_GAS_LIMIT')) {
            errorMessage = '无法预测Gas限制，可能是合约调用失败'
          }
        }
        
        return {
          hash: '',
          success: false,
          error: errorMessage
        }
      }
    })
  }

  // 转账方法 - sendTransaction的别名
  async transfer(
    to: string,
    amount: string,
    privateKey?: string,
    gasStrategy: 'fast' | 'standard' | 'safe' | 'custom' = 'fast',
    customGasConfig?: CustomGasConfig
  ): Promise<{ txHash: string; success: boolean; error?: string }> {
    try {
      // 如果提供了私钥，重新初始化钱包
      if (privateKey) {
        await this.initializeWallet(privateKey)
      }

      const result = await this.sendTransaction(to, amount, gasStrategy, customGasConfig)
      
      return {
        txHash: result.hash,
        success: result.success,
        error: result.error
      }
    } catch (error) {
      console.error('转账失败:', error)
      return {
        txHash: '',
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  }

  // ERC-20代币转账方法 - sendTokenTransaction的别名
  async transferToken(
    tokenAddress: string,
    to: string,
    amount: string,
    privateKey?: string,
    gasStrategy: 'fast' | 'standard' | 'safe' | 'custom' = 'fast',
    customGasConfig?: CustomGasConfig
  ): Promise<{ txHash: string; success: boolean; error?: string }> {
    try {
      // 如果提供了私钥，重新初始化钱包
      if (privateKey) {
        await this.initializeWallet(privateKey)
      }

      const result = await this.sendTokenTransaction(tokenAddress, to, amount, gasStrategy, customGasConfig)
      
      return {
        txHash: result.hash,
        success: result.success,
        error: result.error
      }
    } catch (error) {
      console.error('代币转账失败:', error)
      return {
        txHash: '',
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  }

  // 发送ERC-20代币转账 - 优化版本，增强错误处理
  async sendTokenTransaction(
    tokenAddress: string,
    to: string,
    amount: string,
    gasStrategy: 'fast' | 'standard' | 'safe' | 'custom' = 'fast',
    customGasConfig?: CustomGasConfig
  ): Promise<TransactionResult> {
    return this.retryTransaction(async () => {
      try {
        if (!this.wallet) {
          throw new Error('钱包未初始化')
        }

        // 验证代币合约地址
        if (!ethers.isAddress(tokenAddress)) {
          throw new Error('无效的代币合约地址')
        }

        // 验证目标地址
        if (!ethers.isAddress(to)) {
          throw new Error('无效的目标地址')
        }

        // 验证代币合约是否存在
        const contractCode = await this.provider.getCode(tokenAddress)
        if (contractCode === '0x') {
          throw new Error('代币合约地址不存在或无效')
        }

        // 创建合约实例
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.wallet)
        
        // 验证合约是否支持ERC-20标准
        try {
          await contract.name()
          await contract.symbol()
          await contract.decimals()
        } catch (error) {
          throw new Error('合约不支持ERC-20标准或接口不完整')
        }

        const tokenInfo = await this.getTokenInfo(tokenAddress)
        const value = ethers.parseUnits(amount, tokenInfo.decimals)

        if (value <= BigInt(0)) {
          throw new Error('转账金额必须大于0')
        }

        // 检查代币余额是否足够
        const tokenBalance = await this.getTokenBalance(tokenAddress)
        const balanceWei = ethers.parseUnits(tokenBalance.formattedBalance, tokenInfo.decimals)

        if (balanceWei < value) {
          throw new Error(`代币余额不足: 需要 ${amount} ${tokenInfo.symbol}，当前余额 ${tokenBalance.formattedBalance} ${tokenInfo.symbol}`)
        }

        // 估算Gas费用
        const gasEstimate = await this.estimateTokenGas(tokenAddress, to, amount, gasStrategy, customGasConfig)

        // 检查ETH余额是否足够支付Gas费用
        const ethBalance = await this.getBalance()
        const ethBalanceWei = ethers.parseEther(ethBalance)

        if (ethBalanceWei < gasEstimate.totalCost) {
          throw new Error(`ETH余额不足以支付Gas费用: 需要 ${ethers.formatEther(gasEstimate.totalCost)} MATIC，当前余额 ${ethBalance} MATIC`)
        }

        // 构建交易选项
        const txOptions: any = {
          gasLimit: gasEstimate.gasLimit
        }

        // 使用EIP-1559费用结构或传统Gas价格
        if (gasEstimate.maxFeePerGas && gasEstimate.maxPriorityFeePerGas) {
          txOptions.maxFeePerGas = gasEstimate.maxFeePerGas
          txOptions.maxPriorityFeePerGas = gasEstimate.maxPriorityFeePerGas
          txOptions.type = 2
        } else {
          txOptions.gasPrice = gasEstimate.gasPrice
        }

        console.log('🚀 发送代币转账:', {
          tokenAddress,
          tokenSymbol: tokenInfo.symbol,
          to: formatAddress(to),
          amount: `${amount} ${tokenInfo.symbol}`,
          gasLimit: txOptions.gasLimit.toString(),
          gasPrice: txOptions.gasPrice ? ethers.formatUnits(txOptions.gasPrice, 'gwei') + ' gwei' : 'EIP-1559'
        })

        // 发送代币转账交易
        const txResponse = await contract.transfer(formatAddress(to), value, txOptions)
        
        console.log(`📝 代币转账已发送，哈希: ${txResponse.hash}`)
        
        // 等待交易确认
        const receipt = await txResponse.wait(1)
        
        if (!receipt) {
          throw new Error('交易确认失败')
        }

        if (receipt.status === 0) {
          throw new Error('代币转账执行失败，可能被回滚')
        }

        console.log(`✅ 代币转账确认成功，Gas使用: ${receipt.gasUsed.toString()}`)

        return {
          hash: txResponse.hash,
          success: receipt.status === 1,
          gasUsed: receipt.gasUsed,
          gasPrice: receipt.gasPrice || gasEstimate.gasPrice
        }
      } catch (error) {
        console.error('❌ 代币转账失败:', error)
        
        // 详细错误处理
        let errorMessage = '未知错误'
        
        if (error instanceof Error) {
          errorMessage = error.message
          
          // 处理特定的错误类型
          if (errorMessage.includes('CALL_EXCEPTION')) {
            errorMessage = '代币合约调用失败，可能是合约地址无效或函数调用错误'
          } else if (errorMessage.includes('INSUFFICIENT_FUNDS')) {
            errorMessage = 'ETH余额不足，无法支付Gas费用'
          } else if (errorMessage.includes('UNPREDICTABLE_GAS_LIMIT')) {
            errorMessage = '无法预测Gas限制，可能是代币合约调用失败'
          } else if (errorMessage.includes('execution reverted')) {
            errorMessage = '代币转账被合约回滚，可能是余额不足或权限问题'
          }
        }
        
        return {
          hash: '',
          success: false,
          error: errorMessage
        }
      }
    })
  }

  // 批量发送交易 - 新增功能
  async sendBatchTransactions(
    transactions: Array<{ to: string; amount: string }>,
    gasStrategy: 'fast' | 'standard' | 'safe' | 'custom' = 'fast',
    customGasConfig?: CustomGasConfig
  ): Promise<TransactionResult[]> {
    const results: TransactionResult[] = []
    
    for (const tx of transactions) {
      try {
        const result = await this.sendTransaction(tx.to, tx.amount, gasStrategy, customGasConfig)
        results.push(result)
        
        // 如果交易失败，停止后续交易
        if (!result.success) {
          break
        }
        
        // 交易间隔，避免nonce冲突
        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (error) {
        results.push({
          hash: '',
          success: false,
          error: error instanceof Error ? error.message : '未知错误'
        })
        break
      }
    }
    
    return results
  }

  // 批量发送代币交易
  async sendBatchTokenTransactions(
    tokenAddress: string,
    transactions: Array<{ to: string; amount: string }>,
    gasStrategy: 'fast' | 'standard' | 'safe' | 'custom' = 'fast',
    customGasConfig?: CustomGasConfig
  ): Promise<TransactionResult[]> {
    const results: TransactionResult[] = []
    
    for (const tx of transactions) {
      try {
        const result = await this.sendTokenTransaction(tokenAddress, tx.to, tx.amount, gasStrategy, customGasConfig)
        results.push(result)
        
        // 如果交易失败，停止后续交易
        if (!result.success) {
          break
        }
        
        // 交易间隔，避免nonce冲突
        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (error) {
        results.push({
          hash: '',
          success: false,
          error: error instanceof Error ? error.message : '未知错误'
        })
        break
      }
    }
    
    return results
  }

  // 计算最大可转账金额 - 新增功能
  async calculateMaxTransferAmount(
    to: string,
    transferType: 'native' | 'token' = 'native',
    tokenAddress?: string,
    gasStrategy: 'fast' | 'standard' | 'safe' | 'custom' = 'fast',
    customGasConfig?: CustomGasConfig
  ): Promise<{
    maxAmount: string
    gasEstimate: GasEstimate
    availableBalance: string
    canTransfer: boolean
  }> {
    try {
      if (!this.wallet) {
        throw new Error('钱包未初始化，请先导入私钥')
      }

      if (!to || !ethers.isAddress(to)) {
        throw new Error('目标地址格式无效，请检查地址是否正确')
      }
      
      // 安全检查：防止转账到自己的地址
      const fromAddress = this.getWalletAddress()
      if (fromAddress && to.toLowerCase() === fromAddress.toLowerCase()) {
        throw new Error('不能转账到自己的地址')
      }
      
      // 检查网络连接
      try {
        await this.provider.getBlockNumber()
      } catch (error) {
        throw new Error('网络连接失败，请检查网络状态')
      }

      if (transferType === 'token') {
        // ERC-20代币最大转账计算
        if (!tokenAddress) {
          throw new Error('代币地址不能为空')
        }

        const [tokenBalance, ethBalance] = await Promise.all([
          this.getTokenBalance(tokenAddress),
          this.getBalance()
        ])

        // 估算代币转账的Gas费用（使用最小转账金额进行估算）
        const minAmount = '0.000001' // 最小代币数量用于Gas估算
        const gasEstimate = await this.estimateTokenGas(
          tokenAddress,
          to,
          minAmount,
          gasStrategy,
          customGasConfig
        )

        const ethBalanceWei = ethers.parseEther(ethBalance)
        const canPayGas = ethBalanceWei >= gasEstimate.totalCost

        return {
          maxAmount: canPayGas ? tokenBalance.formattedBalance : '0',
          gasEstimate,
          availableBalance: tokenBalance.formattedBalance,
          canTransfer: canPayGas && parseFloat(tokenBalance.formattedBalance) > 0
        }
      } else {
        // 原生MATIC最大转账计算
        const balance = await this.getBalance()
        const balanceWei = ethers.parseEther(balance)

        // 估算转账Gas费用（使用最小转账金额进行估算）
        const minAmount = '0.001' // 最小MATIC数量用于Gas估算
        const gasEstimate = await this.estimateGas(
          to,
          minAmount,
          gasStrategy,
          customGasConfig
        )

        // 计算最大可转账金额 = 总余额 - Gas费用
        const maxAmountWei = balanceWei - gasEstimate.totalCost
        const maxAmount = maxAmountWei > 0 ? ethers.formatEther(maxAmountWei) : '0'

        return {
          maxAmount,
          gasEstimate,
          availableBalance: balance,
          canTransfer: maxAmountWei > 0
        }
      }
    } catch (error) {
      console.error('计算最大转账金额失败:', error)
      throw new Error('计算最大转账金额失败')
    }
  }

  // 执行最大数额转账 - 新增功能
  async executeMaxTransfer(
    to: string,
    transferType: 'native' | 'token' = 'native',
    tokenAddress?: string,
    gasStrategy: 'fast' | 'standard' | 'safe' | 'custom' = 'fast',
    customGasConfig?: CustomGasConfig
  ): Promise<TransactionResult> {
    try {
      // 执行前的安全检查
      console.log(`开始执行最大数额转账: ${transferType === 'token' ? '代币' : 'MATIC'} -> ${to}`)
      
      const maxTransferData = await this.calculateMaxTransferAmount(
        to,
        transferType,
        tokenAddress,
        gasStrategy,
        customGasConfig
      )

      if (!maxTransferData.canTransfer) {
        throw new Error('余额不足以支付转账和Gas费用，请检查账户余额')
      }

      if (parseFloat(maxTransferData.maxAmount) <= 0) {
        throw new Error('计算出的可转账金额为零，可能余额不足以支付Gas费用')
      }
      
      // 额外的安全检查：确保转账金额合理
      const transferAmount = parseFloat(maxTransferData.maxAmount)
      if (transferType === 'native' && transferAmount > 1000) {
        console.warn(`警告: 即将转账大额MATIC (${transferAmount}), 请确认操作正确`)
      }
      
      console.log(`准备转账金额: ${maxTransferData.maxAmount} ${transferType === 'token' ? '代币' : 'MATIC'}`)
      console.log(`预估Gas费用: ${ethers.formatEther(maxTransferData.gasEstimate.totalCost)} MATIC`)

      // 执行转账
      let result: TransactionResult
      if (transferType === 'token' && tokenAddress) {
        console.log(`执行ERC-20代币转账: ${tokenAddress}`)
        result = await this.sendTokenTransaction(
          tokenAddress,
          to,
          maxTransferData.maxAmount,
          gasStrategy,
          customGasConfig
        )
      } else {
        console.log('执行原生MATIC转账')
        result = await this.sendTransaction(
          to,
          maxTransferData.maxAmount,
          gasStrategy,
          customGasConfig
        )
      }
      
      // 转账结果验证和日志
      if (result.success && result.hash) {
        console.log(`✅ 最大数额转账成功! 交易哈希: ${result.hash}`)
        console.log(`转账金额: ${maxTransferData.maxAmount} ${transferType === 'token' ? '代币' : 'MATIC'}`)
      } else {
        console.error(`❌ 最大数额转账失败: ${result.error || '未知错误'}`)
      }
      
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      console.error('执行最大数额转账失败:', error)
      
      // 详细的错误分类
      let detailedError = errorMessage
      if (errorMessage.includes('insufficient funds')) {
        detailedError = '余额不足，无法完成转账操作'
      } else if (errorMessage.includes('gas')) {
        detailedError = `Gas相关错误: ${errorMessage}。建议调整Gas策略或等待网络拥堵缓解`
      } else if (errorMessage.includes('nonce')) {
        detailedError = 'Nonce错误，可能存在待确认的交易。请稍后重试'
      } else if (errorMessage.includes('network')) {
        detailedError = '网络连接错误，请检查网络状态后重试'
      } else if (errorMessage.includes('revert')) {
        detailedError = '交易被拒绝，可能是合约执行失败或权限不足'
      }
      
      return {
        hash: '',
        success: false,
        error: detailedError
      }
    }
  }

  // 监听地址余额变化 - 优化版本
  async monitorBalance(
    address: string,
    callback: (balance: string, blockNumber?: number) => void,
    interval: number = 3000
  ): Promise<() => void> {
    let isMonitoring = true
    let lastBalance = '0'
    let lastBlockNumber = 0

    const monitor = async () => {
      if (!isMonitoring) return

      try {
        const [currentBalance, blockNumber] = await Promise.all([
          this.getBalance(address),
          this.provider.getBlockNumber()
        ])
        
        // 只有在余额变化或新区块时才触发回调
        if (currentBalance !== lastBalance || blockNumber > lastBlockNumber) {
          lastBalance = currentBalance
          lastBlockNumber = blockNumber
          callback(currentBalance, blockNumber)
        }
      } catch (error) {
        console.error('余额监控错误:', error)
        // 网络错误时延长检查间隔
        if (isMonitoring) {
          setTimeout(monitor, interval * 2)
          return
        }
      }

      if (isMonitoring) {
        setTimeout(monitor, interval)
      }
    }

    // 立即执行一次
    monitor()

    // 返回停止监控的函数
    return () => {
      isMonitoring = false
    }
  }

  // 监听ERC-20代币余额变化
  async monitorTokenBalance(
    tokenAddress: string,
    walletAddress: string,
    callback: (balance: string, blockNumber?: number) => void,
    interval: number = 3000
  ): Promise<() => void> {
    let isMonitoring = true
    let lastBalance = '0'
    let lastBlockNumber = 0

    const monitor = async () => {
      if (!isMonitoring) return

      try {
        const [currentBalance, blockNumber] = await Promise.all([
          this.getTokenBalance(tokenAddress, walletAddress),
          this.provider.getBlockNumber()
        ])
        
        // 只有在余额变化或新区块时才触发回调
        if (currentBalance.balance !== lastBalance || blockNumber > lastBlockNumber) {
          lastBalance = currentBalance.balance
          lastBlockNumber = blockNumber
          callback(currentBalance.balance, blockNumber)
        }
      } catch (error) {
        console.error('代币余额监控错误:', error)
        // 网络错误时延长检查间隔
        if (isMonitoring) {
          setTimeout(monitor, interval * 2)
          return
        }
      }

      if (isMonitoring) {
        setTimeout(monitor, interval)
      }
    }

    // 立即执行一次
    monitor()

    // 返回停止监控的函数
    return () => {
      isMonitoring = false
    }
  }

  // WebSocket实时监控 - 新增功能
  async startWebSocketMonitor(
    address: string,
    callback: (data: { balance: string; blockNumber: number; timestamp: number }) => void
  ): Promise<() => void> {
    let isConnected = true
    
    // 使用WebSocket监听新区块
    const wsProvider = new ethers.WebSocketProvider('wss://polygon-mainnet.g.alchemy.com/v2/demo')
    
    const handleNewBlock = async (blockNumber: number) => {
      if (!isConnected) return
      
      try {
        const balance = await this.getBalance(address)
        callback({
          balance,
          blockNumber,
          timestamp: Date.now()
        })
      } catch (error) {
        console.error('WebSocket监控错误:', error)
      }
    }

    wsProvider.on('block', handleNewBlock)

    return () => {
      isConnected = false
      wsProvider.removeAllListeners()
      wsProvider.destroy()
    }
  }

  // ERC-20代币WebSocket实时监控
  async startTokenWebSocketMonitor(
    tokenAddress: string,
    walletAddress: string,
    callback: (data: { balance: string; blockNumber: number; timestamp: number; tokenInfo: TokenInfo }) => void
  ): Promise<() => void> {
    let isConnected = true
    
    // 使用WebSocket监听新区块
    const wsProvider = new ethers.WebSocketProvider('wss://polygon-mainnet.g.alchemy.com/v2/demo')
    
    // 获取代币信息（只需要获取一次）
    const tokenInfo = await this.getTokenInfo(tokenAddress)
    
    const handleNewBlock = async (blockNumber: number) => {
      if (!isConnected) return
      
      try {
        const tokenBalance = await this.getTokenBalance(tokenAddress, walletAddress)
        callback({
          balance: tokenBalance.balance,
          blockNumber,
          timestamp: Date.now(),
          tokenInfo
        })
      } catch (error) {
        console.error('代币WebSocket监控错误:', error)
      }
    }

    wsProvider.on('block', handleNewBlock)

    return () => {
      isConnected = false
      wsProvider.removeAllListeners()
      wsProvider.destroy()
    }
  }

  // 获取交易详情
  async getTransactionDetails(txHash: string) {
    try {
      const tx = await this.provider.getTransaction(txHash)
      const receipt = await this.provider.getTransactionReceipt(txHash)
      
      return {
        transaction: tx,
        receipt
      }
    } catch (error) {
      console.error('获取交易详情失败:', error)
      throw new Error('获取交易详情失败')
    }
  }

  // 检查网络连接 - 优化版本
  async checkConnection(): Promise<{
    connected: boolean
    chainId?: bigint
    blockNumber?: number
    latency?: number
  }> {
    const startTime = Date.now()
    
    try {
      const [network, blockNumber] = await Promise.all([
        this.provider.getNetwork(),
        this.provider.getBlockNumber()
      ])
      
      const latency = Date.now() - startTime
      const connected = network.chainId === BigInt(POLYGON_CHAIN_ID)
      
      return {
        connected,
        chainId: network.chainId,
        blockNumber,
        latency
      }
    } catch (error) {
      console.error('网络连接检查失败:', error)
      return {
        connected: false,
        latency: Date.now() - startTime
      }
    }
  }

  // 获取网络状态 - 新增功能
  async getNetworkStatus(): Promise<{
    chainId: bigint
    blockNumber: number
    gasPrice: string
    congestion: number
    latency: number
  }> {
    const startTime = Date.now()
    
    try {
      const [network, blockNumber, feeData] = await Promise.all([
        this.provider.getNetwork(),
        this.provider.getBlockNumber(),
        this.provider.getFeeData()
      ])
      
      const congestion = await this.getNetworkCongestion()
      const latency = Date.now() - startTime
      
      return {
        chainId: network.chainId,
        blockNumber,
        gasPrice: this.formatGasPrice(feeData.gasPrice || BigInt(0)),
        congestion,
        latency
      }
    } catch (error) {
      console.error('获取网络状态失败:', error)
      throw new Error('获取网络状态失败')
    }
  }

  // 格式化Gas价格为Gwei
  formatGasPrice(gasPrice: bigint): string {
    return ethers.formatUnits(gasPrice, 'gwei')
  }

  // 清理资源 - 优化版本
  cleanup(): void {
    this.wallet = null
    // 清理可能的监听器
    this.provider.removeAllListeners()
  }

  // 重新连接 - 新增功能
  async reconnect(): Promise<boolean> {
    try {
      this.provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL)
      const connection = await this.checkConnection()
      return connection.connected
    } catch (error) {
      console.error('重新连接失败:', error)
      return false
    }
  }
}

// 导出单例实例
export const blockchainService = new BlockchainService()