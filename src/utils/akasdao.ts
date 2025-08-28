import { ethers } from 'ethers'
import { TOKEN_ADDRESSES } from './tokens'
import { 
  validateContractAddress, 
  storeValidatedContract, 
  isContractValidated, 
  getValidatedContractInfo,
  ContractValidationResult 
} from './contractValidation'

// AkasaDAO Turbine协议配置
export const AKASDAO_CONFIG = {
  // Turbine协议合约地址
  TURBINE_CONTRACT: '0x43208F448dE982a2d8a2dF8F8E78574b98f2aA74',
  // Turbine协议ABI - 根据实际交易更新为正确的函数
  TURBINE_ABI: [
    'function silence(address _recipient, uint256 _usdtAmount, uint256 deadline) external',
    'function vortexToTurbine(address token, uint256 amount) external returns (uint256)',
    'function withdraw(address token, uint256 amount) external returns (uint256)',
    'function balanceOf(address token, address user) external view returns (uint256)',
    'function getAPY(address token) external view returns (uint256)',
    'event Vortex(address indexed user, address indexed token, uint256 amount, uint256 shares)',
    'event Withdraw(address indexed user, address indexed token, uint256 amount, uint256 shares)',
    'event Silenced(address indexed _recipient, uint256 _silenceAmount, uint256 _usdtAmount, uint256 timestamp)'
  ]
}

// 涡旋记录接口
export interface VortexRecord {
  id: string
  tokenAddress: string
  tokenSymbol: string
  amount: string
  shares: string
  timestamp: Date
  txHash: string
  status: 'pending' | 'confirmed' | 'failed'
  apy?: string
}

// AkasaDAO Turbine服务类
export class AkasaDAOService {
  private provider: ethers.JsonRpcProvider
  private wallet: ethers.Wallet | null = null
  private turbineContract: ethers.Contract | null = null
  private networkId: number = 137 // Polygon主网

  constructor(provider: ethers.JsonRpcProvider) {
    this.provider = provider
  }

  // 验证并缓存合约地址
  async validateAndCacheContract(address: string): Promise<ContractValidationResult> {
    try {
      // 首先检查是否已经验证过
      if (isContractValidated(address, this.networkId)) {
        const cachedInfo = getValidatedContractInfo(address, this.networkId)
        if (cachedInfo) {
          return {
            isValid: cachedInfo.isValid,
            contractType: cachedInfo.contractType,
            name: cachedInfo.name,
            symbol: cachedInfo.symbol,
            decimals: cachedInfo.decimals
          }
        }
      }

      // 如果没有缓存或缓存过期，重新验证
      const result = await validateContractAddress(address, this.provider)
      
      // 保存验证结果
      storeValidatedContract(address, result, this.networkId)
      
      return result
    } catch (error) {
      console.error('合约验证失败:', error)
      return {
        isValid: false,
        error: error instanceof Error ? error.message : '验证失败'
      }
    }
  }

  // 初始化钱包
  async initializeWallet(privateKey: string) {
    try {
      this.wallet = new ethers.Wallet(privateKey, this.provider)
      
      // 验证Turbine合约地址
      const validationResult = await this.validateAndCacheContract(AKASDAO_CONFIG.TURBINE_CONTRACT)
      
      if (!validationResult.isValid) {
        throw new Error(`Turbine合约地址无效: ${validationResult.error}`)
      }
      
      // 重新初始化合约实例，确保使用正确的钱包
      this.turbineContract = new ethers.Contract(
        AKASDAO_CONFIG.TURBINE_CONTRACT,
        AKASDAO_CONFIG.TURBINE_ABI,
        this.wallet
      )
      
      // 验证合约实例
      if (!this.turbineContract || !this.turbineContract.silence) {
        throw new Error('合约实例初始化失败或silence函数不存在')
      }
      
      console.log('AkasaDAO服务初始化成功，合约验证状态:', validationResult)
      console.log('合约实例状态:', {
        address: this.turbineContract.target,
        hasSilence: !!this.turbineContract.silence,
        signer: this.turbineContract.signer ? '已设置' : '未设置'
      })
    } catch (error) {
      console.error('初始化AkasaDAO服务失败:', error)
      throw new Error('初始化AkasaDAO服务失败')
    }
  }

  // 获取钱包地址
  getWalletAddress(): string | null {
    return this.wallet?.address || null
  }

  // 检查代币余额
  async getTokenBalance(tokenAddress: string): Promise<string> {
    if (!this.wallet) {
      throw new Error('钱包未初始化')
    }

    try {
      const erc20Abi = [
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)'
      ]
      
      const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, this.provider)
      const [balance, decimals] = await Promise.all([
        tokenContract.balanceOf(this.wallet.address),
        tokenContract.decimals()
      ])

      return ethers.formatUnits(balance, decimals)
    } catch (error) {
      console.error('获取代币余额失败:', error)
      throw new Error('获取代币余额失败')
    }
  }

  // 检查代币授权
  async checkAndApproveToken(
    tokenAddress: string,
    amount: string
  ): Promise<boolean> {
    if (!this.wallet) {
      throw new Error('钱包未初始化')
    }

    try {
      const erc20Abi = [
        'function allowance(address owner, address spender) view returns (uint256)',
        'function approve(address spender, uint256 amount) returns (bool)',
        'function decimals() view returns (uint8)'
      ]
      
      const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, this.wallet)
      const tokenInfo = this.getTokenInfo(tokenAddress)
      if (!tokenInfo) {
        throw new Error('不支持的代币')
      }

      const amountWei = ethers.parseUnits(amount, tokenInfo.decimals)
      const currentAllowance = await tokenContract.allowance(this.wallet.address, AKASDAO_CONFIG.TURBINE_CONTRACT)
      
      // 如果授权不足，进行授权
      if (currentAllowance < amountWei) {
        console.log('授权不足，正在授权...')
        const approveTx = await tokenContract.approve(AKASDAO_CONFIG.TURBINE_CONTRACT, amountWei)
        await approveTx.wait()
        console.log('授权成功')
        return true
      }
      
      return false // 已有足够授权
    } catch (error) {
      console.error('检查授权失败:', error)
      throw new Error(`授权失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  // 涡旋到Turbine (使用silence函数)
  async vortexToTurbine(
    tokenAddress: string, 
    amount: string
  ): Promise<{ txHash: string; shares: string }> {
    if (!this.turbineContract || !this.wallet) {
      throw new Error('服务未初始化')
    }

    try {
      console.log('开始涡旋到Turbine...')
      console.log('代币地址:', tokenAddress)
      console.log('涡旋金额:', amount)
      console.log('钱包地址:', this.wallet.address)

      const tokenInfo = this.getTokenInfo(tokenAddress)
      if (!tokenInfo) {
        throw new Error('不支持的代币')
      }

      // 检查余额
      const balance = await this.getTokenBalance(tokenAddress)
      console.log('当前余额:', balance)
      
      if (parseFloat(balance) < parseFloat(amount)) {
        throw new Error(`余额不足: 需要 ${amount} ${tokenInfo.symbol}, 当前余额 ${balance} ${tokenInfo.symbol}`)
      }

      // 检查并授权代币
      console.log('检查代币授权...')
      await this.checkAndApproveToken(tokenAddress, amount)

      const amountWei = ethers.parseUnits(amount, tokenInfo.decimals)
      console.log('涡旋金额(Wei):', amountWei.toString())
      
      // 设置截止时间 (当前时间 + 1小时)
      const deadline = Math.floor(Date.now() / 1000) + 3600
      
      console.log('调用Turbine合约silence函数...')
      const tx = await this.turbineContract.silence(
        this.wallet.address, // _recipient: 接收者地址
        amountWei,           // _usdtAmount: USDT金额
        deadline             // deadline: 截止时间
      )
      console.log('交易已发送，等待确认...')
      await tx.wait()
      console.log('涡旋成功!')
      
      return {
        txHash: tx.hash,
        shares: '0' // 简化处理
      }
    } catch (error) {
      console.error('涡旋到Turbine失败:', error)
      throw new Error(`涡旋失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  // 执行silence操作
  async silence(daiAmount: string, gasConfig?: { 
    gasLimit?: string; 
    gasStrategy?: 'fast' | 'standard' | 'safe' | 'custom';
    gasMultiplier?: number;
    rescueMode?: boolean;
    rescueGasMultiplier?: number;
  }): Promise<{ txHash: string }> {
    if (!this.wallet || !this.turbineContract) {
      throw new Error('钱包或合约未初始化')
    }

    try {
      console.log('开始执行silence操作...')
      console.log('钱包地址:', this.wallet.address)

      // 验证输入参数
      if (!daiAmount || parseFloat(daiAmount) <= 0) {
        throw new Error('DAI金额必须大于0')
      }

      // 检查DAI余额
      const daiBalance = await this.getTokenBalance(TOKEN_ADDRESSES.DAI)
      console.log('当前DAI余额:', daiBalance)
      
      if (parseFloat(daiBalance) < parseFloat(daiAmount)) {
        throw new Error(`DAI余额不足: 需要 ${daiAmount} DAI, 当前余额 ${daiBalance} DAI`)
      }

      // 检查并授权DAI
      console.log('检查DAI授权...')
      const approvalAmount = (parseFloat(daiAmount) * 10).toString() // 授权10倍金额
      await this.checkAndApproveToken(TOKEN_ADDRESSES.DAI, approvalAmount)

      const amountWei = ethers.parseUnits(daiAmount, 18) // DAI有18位小数
      console.log('DAI金额(Wei):', amountWei.toString())
      
      // 设置截止时间 (当前时间 + 1小时)
      const deadline = Math.floor(Date.now() / 1000) + 3600
      console.log('截止时间:', deadline, '(', new Date(deadline * 1000).toISOString(), ')')
      
      // 重新验证合约实例
      console.log('验证合约实例...')
      if (!this.turbineContract || !this.turbineContract.silence) {
        console.log('重新初始化合约实例...')
        this.turbineContract = new ethers.Contract(
          AKASDAO_CONFIG.TURBINE_CONTRACT,
          AKASDAO_CONFIG.TURBINE_ABI,
          this.wallet
        )
      }
      
      // 验证合约函数
      console.log('验证合约函数...')
      if (!this.turbineContract.silence) {
        throw new Error('silence函数不存在于合约ABI中')
      }
      
      // 检查合约代码
      const contractCode = await this.provider.getCode(AKASDAO_CONFIG.TURBINE_CONTRACT)
      if (contractCode === '0x') {
        throw new Error('合约地址无效或合约不存在')
      }
      
      console.log('合约验证通过，开始调用silence函数...')
      
      // 使用用户配置的gas设置或默认设置
      const txOptions: any = {}
      
      if (gasConfig) {
        // 使用blockchain.ts中的gas估算方法
        const gasEstimate = await this.estimateSilenceGas(daiAmount, gasConfig)
        
        txOptions.gasLimit = gasEstimate.gasLimit
        
        if (gasEstimate.maxFeePerGas && gasEstimate.maxPriorityFeePerGas) {
          txOptions.maxFeePerGas = gasEstimate.maxFeePerGas
          txOptions.maxPriorityFeePerGas = gasEstimate.maxPriorityFeePerGas
        } else if (gasEstimate.gasPrice) {
          txOptions.gasPrice = gasEstimate.gasPrice
        }
      } else {
        // 使用默认gas设置
        txOptions.gasLimit = BigInt(300000)
      }
      
      console.log('调用参数:')
      console.log('- recipient:', this.wallet.address)
      console.log('- amountWei:', amountWei.toString())
      console.log('- deadline:', deadline)
      console.log('- gasLimit:', txOptions.gasLimit.toString())
      
      // 验证合约接口
      console.log('验证合约接口...')
      const contractInterface = this.turbineContract.interface;
      const silenceFragment = contractInterface.getFunction('silence');
      if (!silenceFragment) {
        throw new Error('无法获取silence函数片段')
      }
      console.log('函数签名:', silenceFragment.format());
      
      // 编码函数调用数据
      console.log('编码函数调用数据...')
      const encodedData = contractInterface.encodeFunctionData('silence', [
        this.wallet.address,
        amountWei,
        deadline
      ]);
      console.log('编码数据:', encodedData);
      
      // 调用silence函数 - 使用覆盖选项传递交易参数
      const tx = await this.turbineContract.silence(
        this.wallet.address, // _recipient: 接收者地址
        amountWei,           // _usdtAmount: DAI金额
        deadline,            // deadline: 截止时间
        { ...txOptions }     // 交易选项作为覆盖选项
      )
      
      console.log('交易已发送，等待确认...')
      console.log('交易哈希:', tx.hash)
      
      // 等待交易确认
      const receipt = await tx.wait()
      console.log('交易确认成功!')
      console.log('Gas使用量:', receipt.gasUsed.toString())
      console.log('区块号:', receipt.blockNumber)
      
      return {
        txHash: tx.hash
      }
    } catch (error) {
      console.error('Silence调用失败:', error)
      
      // 提供更详细的错误信息
      let errorMessage = 'Silence失败: '
      
      if (error instanceof Error) {
        if (error.message.includes('execution reverted')) {
          errorMessage += '合约执行被回滚，可能的原因：\n'
          errorMessage += '1. 合约状态不允许silence操作\n'
          errorMessage += '2. 参数验证失败\n'
          errorMessage += '3. 余额或授权不足\n'
          errorMessage += '4. 截止时间已过期\n'
          errorMessage += '5. 合约暂停或维护中\n'
          errorMessage += '6. 接收者地址无效\n'
          errorMessage += '7. 金额超出合约限制\n'
          errorMessage += '\n原始错误: ' + error.message
        } else if (error.message.includes('insufficient funds')) {
          errorMessage += '余额不足，无法支付Gas费用'
        } else if (error.message.includes('nonce')) {
          errorMessage += 'Nonce错误，请稍后重试'
        } else if (error.message.includes('network')) {
          errorMessage += '网络连接错误，请检查网络后重试'
        } else {
          errorMessage += error.message
        }
      } else {
        errorMessage += '未知错误'
      }
      
      throw new Error(errorMessage)
    }
  }

  // 估算silence操作的gas费用
  private async estimateSilenceGas(
    daiAmount: string, 
    gasConfig: { 
      gasLimit?: string; 
      gasStrategy?: 'fast' | 'standard' | 'safe' | 'custom';
      gasMultiplier?: number;
      rescueMode?: boolean;
      rescueGasMultiplier?: number;
    }
  ) {
    try {
      const amountWei = ethers.parseUnits(daiAmount, 18)
      const deadline = Math.floor(Date.now() / 1000) + 3600
      
      // 估算gas限制
      const estimatedGasLimit = await this.turbineContract!.silence.estimateGas(
        this.wallet!.address,
        amountWei,
        deadline
      )
      
      // 获取费用数据
      const feeData = await this.provider.getFeeData()
      
      // 计算gas倍数
      let multiplier = 1
      if (gasConfig.rescueMode && gasConfig.rescueGasMultiplier) {
        multiplier = gasConfig.rescueGasMultiplier
      } else if (gasConfig.gasMultiplier) {
        multiplier = gasConfig.gasMultiplier
      }
      
      // 使用自定义gas限制或估算值
      const finalGasLimit = gasConfig.gasLimit 
        ? BigInt(gasConfig.gasLimit)
        : estimatedGasLimit
      
      // 支持EIP-1559的动态费用
      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        const maxFeePerGas = BigInt(Math.floor(Number(feeData.maxFeePerGas) * multiplier))
        const maxPriorityFeePerGas = BigInt(Math.floor(Number(feeData.maxPriorityFeePerGas) * multiplier))
        
        return {
          gasLimit: finalGasLimit,
          maxFeePerGas,
          maxPriorityFeePerGas
        }
      } else {
        // 传统gas价格
        const baseGasPrice = feeData.gasPrice || BigInt(0)
        const gasPrice = BigInt(Math.floor(Number(baseGasPrice) * multiplier))
        
        return {
          gasLimit: finalGasLimit,
          gasPrice
        }
      }
    } catch (error) {
      console.error('Gas估算失败，使用默认值:', error)
      return {
        gasLimit: BigInt(300000)
      }
    }
  }

  // 获取provider实例
  getProvider(): ethers.JsonRpcProvider {
    return this.provider
  }

  // 获取代币信息
  private getTokenInfo(tokenAddress: string) {
    const tokenInfoMap = {
      [TOKEN_ADDRESSES.DAI]: { symbol: 'DAI', decimals: 18 },
      [TOKEN_ADDRESSES.USDC]: { symbol: 'USDC', decimals: 6 },
      [TOKEN_ADDRESSES.USDT]: { symbol: 'USDT', decimals: 6 },
      [TOKEN_ADDRESSES.WETH]: { symbol: 'WETH', decimals: 18 }
    }
    
    return tokenInfoMap[tokenAddress] || null
  }

  // 获取抢跑Gas配置
  async getRushGasConfig(): Promise<{
    gasStrategy: string
    gasMultiplier: number
    customGasPrice: string
    maxPriorityFeePerGas: string
    maxFeePerGas: string
  }> {
    const feeData = await this.provider.getFeeData()
    const currentGasPrice = feeData.gasPrice || ethers.parseUnits('30', 'gwei')
    const currentGasGwei = parseFloat(ethers.formatUnits(currentGasPrice, 'gwei'))
    
    // 计算抢跑Gas价格 - 比当前价格高50-100%
    const rushGasPrice = Math.ceil(currentGasGwei * 1.8) // 提高80%
    
    console.log(`当前网络Gas价格: ${currentGasGwei} Gwei`)
    console.log(`抢跑Gas价格: ${rushGasPrice} Gwei`)
    
    return {
      gasStrategy: 'rush',
      gasMultiplier: 2.0,
      customGasPrice: rushGasPrice.toString(),
      maxPriorityFeePerGas: Math.ceil(rushGasPrice * 0.8).toString(), // 设置优先费用
      maxFeePerGas: (rushGasPrice * 1.2).toString() // 设置最大费用
    }
  }

  // 获取超高速Gas配置
  async getUltraRushGasConfig(): Promise<{
    gasStrategy: string
    gasMultiplier: number
    customGasPrice: string
    maxPriorityFeePerGas: string
    maxFeePerGas: string
  }> {
    const feeData = await this.provider.getFeeData()
    const currentGasPrice = feeData.gasPrice || ethers.parseUnits('30', 'gwei')
    const currentGasGwei = parseFloat(ethers.formatUnits(currentGasPrice, 'gwei'))
    
    // 计算超高速Gas价格 - 比当前价格高100-200%
    const ultraRushGasPrice = Math.ceil(currentGasGwei * 2.5) // 提高150%
    
    console.log(`当前网络Gas价格: ${currentGasGwei} Gwei`)
    console.log(`超高速Gas价格: ${ultraRushGasPrice} Gwei`)
    
    return {
      gasStrategy: 'rush',
      gasMultiplier: 3.0,
      customGasPrice: ultraRushGasPrice.toString(),
      maxPriorityFeePerGas: Math.ceil(ultraRushGasPrice * 0.9).toString(),
      maxFeePerGas: (ultraRushGasPrice * 1.5).toString()
    }
  }
}