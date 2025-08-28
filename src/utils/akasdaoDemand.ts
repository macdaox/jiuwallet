import { ethers } from 'ethers'
// 移除未使用的导入
import { 
  validateContractAddress, 
  storeValidatedContract, 
  isContractValidated, 
  getValidatedContractInfo,
  ContractValidationResult 
} from './contractValidation'

// AkasaDAO 活期质押协议配置
export const AKASDAO_DEMAND_CONFIG = {
  // 活期质押合约地址 (从交易中获取)
  DEMAND_CONTRACT: '0xe3A736f5146b14fA3e7412CE00630f08524a741D',
  // AS Token 合约地址
  AS_TOKEN_CONTRACT: '0x60dBB207cee3c326ca40E02BddBd5cc3408dC155',
  // sAS Token 合约地址
  SAS_TOKEN_CONTRACT: '0xbefec6ec4e01fb058798c63a565922e7ec0f708e',
  
  // 活期质押合约ABI - 更新为更常见的质押合约函数
  DEMAND_ABI: [
    'function stake(uint256 amount) external',
    'function unstake(uint256 amount) external',
    'function claim() external',
    'function claimReward() external',
    'function getStakedAmount(address user) external view returns (uint256)',
    'function getRewardAmount(address user) external view returns (uint256)',
    'function balanceOf(address user) external view returns (uint256)',
    'function stakedBalance(address user) external view returns (uint256)',
    'function pendingReward(address user) external view returns (uint256)',
    'event Staked(address indexed user, uint256 amount)',
    'event Unstaked(address indexed user, uint256 amount)',
    'event RewardClaimed(address indexed user, uint256 amount)',
    'event Claimed(address indexed user, uint256 amount)'
  ],
  
  // AS Token ABI
  AS_TOKEN_ABI: [
    'function balanceOf(address account) external view returns (uint256)',
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function transfer(address to, uint256 amount) external returns (bool)',
    'function transferFrom(address from, address to, uint256 amount) external returns (bool)',
    'function name() external view returns (string)',
    'function symbol() external view returns (string)',
    'function decimals() external view returns (uint8)'
  ],
  
  // sAS Token ABI
  SAS_TOKEN_ABI: [
    'function balanceOf(address account) external view returns (uint256)',
    'function transfer(address to, uint256 amount) external returns (bool)',
    'function name() external view returns (string)',
    'function symbol() external view returns (string)',
    'function decimals() external view returns (uint8)'
  ]
}

// 活期质押记录接口
export interface DemandRecord {
  id: string
  action: 'stake' | 'unstake' | 'claim'
  amount: string
  tokenSymbol: string
  timestamp: Date
  txHash: string
  status: 'pending' | 'confirmed' | 'failed'
  error?: string
}

// AkasaDAO 活期质押服务类
export class AkasaDAODemandService {
  private provider: ethers.JsonRpcProvider
  private wallet: ethers.Wallet | null = null
  private demandContract: ethers.Contract | null = null
  private asTokenContract: ethers.Contract | null = null
  private sAsTokenContract: ethers.Contract | null = null
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
      
      // 验证活期质押合约地址
      const demandValidation = await this.validateAndCacheContract(AKASDAO_DEMAND_CONFIG.DEMAND_CONTRACT)
      if (!demandValidation.isValid) {
        throw new Error(`活期质押合约地址无效: ${demandValidation.error}`)
      }
      
      // 验证AS Token合约地址
      const asTokenValidation = await this.validateAndCacheContract(AKASDAO_DEMAND_CONFIG.AS_TOKEN_CONTRACT)
      if (!asTokenValidation.isValid) {
        throw new Error(`AS Token合约地址无效: ${asTokenValidation.error}`)
      }
      
      // 验证sAS Token合约地址
      const sAsTokenValidation = await this.validateAndCacheContract(AKASDAO_DEMAND_CONFIG.SAS_TOKEN_CONTRACT)
      if (!sAsTokenValidation.isValid) {
        throw new Error(`sAS Token合约地址无效: ${sAsTokenValidation.error}`)
      }
      
      // 初始化合约实例
      this.demandContract = new ethers.Contract(
        AKASDAO_DEMAND_CONFIG.DEMAND_CONTRACT,
        AKASDAO_DEMAND_CONFIG.DEMAND_ABI,
        this.wallet
      )
      
      this.asTokenContract = new ethers.Contract(
        AKASDAO_DEMAND_CONFIG.AS_TOKEN_CONTRACT,
        AKASDAO_DEMAND_CONFIG.AS_TOKEN_ABI,
        this.wallet
      )
      
      this.sAsTokenContract = new ethers.Contract(
        AKASDAO_DEMAND_CONFIG.SAS_TOKEN_CONTRACT,
        AKASDAO_DEMAND_CONFIG.SAS_TOKEN_ABI,
        this.wallet
      )
      
      console.log('活期质押服务初始化成功')
      console.log('钱包地址:', this.wallet.address)
      console.log('活期质押合约:', AKASDAO_DEMAND_CONFIG.DEMAND_CONTRACT)
      console.log('AS Token合约:', AKASDAO_DEMAND_CONFIG.AS_TOKEN_CONTRACT)
      console.log('sAS Token合约:', AKASDAO_DEMAND_CONFIG.SAS_TOKEN_CONTRACT)
      
    } catch (error) {
      console.error('活期质押服务初始化失败:', error)
      throw error
    }
  }

  // 获取AS Token余额
  async getAsTokenBalance(): Promise<string> {
    if (!this.asTokenContract || !this.wallet) {
      throw new Error('服务未初始化')
    }

    try {
      const balance = await this.asTokenContract.balanceOf(this.wallet.address)
      const decimals = await this.asTokenContract.decimals()
      return ethers.formatUnits(balance, decimals)
    } catch (error) {
      console.error('获取AS Token余额失败:', error)
      throw new Error(`获取AS Token余额失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  // 获取sAS Token余额
  async getSAsTokenBalance(): Promise<string> {
    if (!this.sAsTokenContract || !this.wallet) {
      throw new Error('服务未初始化')
    }

    try {
      const balance = await this.sAsTokenContract.balanceOf(this.wallet.address)
      const decimals = await this.sAsTokenContract.decimals()
      return ethers.formatUnits(balance, decimals)
    } catch (error) {
      console.error('获取sAS Token余额失败:', error)
      throw new Error(`获取sAS Token余额失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  // 获取已质押金额
  async getStakedAmount(): Promise<string> {
    if (!this.demandContract || !this.wallet) {
      throw new Error('服务未初始化')
    }

    try {
      // 尝试不同的函数名
      let stakedAmount
      try {
        stakedAmount = await this.demandContract.getStakedAmount(this.wallet.address)
      } catch (error) {
        try {
          stakedAmount = await this.demandContract.stakedBalance(this.wallet.address)
        } catch (error2) {
          stakedAmount = await this.demandContract.balanceOf(this.wallet.address)
        }
      }
      return ethers.formatUnits(stakedAmount, 18) // AS Token有18位小数
    } catch (error) {
      console.error('获取已质押金额失败:', error)
      throw new Error(`获取已质押金额失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  // 获取可领取奖励
  async getRewardAmount(): Promise<string> {
    if (!this.demandContract || !this.wallet) {
      throw new Error('服务未初始化')
    }

    try {
      // 尝试不同的函数名
      let rewardAmount
      try {
        rewardAmount = await this.demandContract.getRewardAmount(this.wallet.address)
      } catch (error) {
        try {
          rewardAmount = await this.demandContract.pendingReward(this.wallet.address)
        } catch (error2) {
          // 如果没有奖励函数，返回0
          rewardAmount = ethers.parseUnits('0', 18)
        }
      }
      return ethers.formatUnits(rewardAmount, 18) // AS Token有18位小数
    } catch (error) {
      console.error('获取可领取奖励失败:', error)
      throw new Error(`获取可领取奖励失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  // 检查并授权AS Token
  async checkAndApproveAsToken(amount: string): Promise<void> {
    if (!this.asTokenContract || !this.demandContract || !this.wallet) {
      throw new Error('服务未初始化')
    }

    try {
      const amountWei = ethers.parseUnits(amount, 18)
      const allowance = await this.asTokenContract.allowance(
        this.wallet.address,
        AKASDAO_DEMAND_CONFIG.DEMAND_CONTRACT
      )

      if (allowance < amountWei) {
        console.log('授权AS Token...')
        const approveTx = await this.asTokenContract.approve(
          AKASDAO_DEMAND_CONFIG.DEMAND_CONTRACT,
          ethers.MaxUint256 // 授权最大数量
        )
        await approveTx.wait()
        console.log('AS Token授权成功')
      } else {
        console.log('AS Token已授权，无需重复授权')
      }
    } catch (error) {
      console.error('AS Token授权失败:', error)
      throw new Error(`AS Token授权失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  // 质押AS Token
  async stake(amount: string): Promise<{ txHash: string }> {
    if (!this.demandContract || !this.wallet) {
      throw new Error('服务未初始化')
    }

    try {
      console.log('开始质押AS Token...')
      console.log('质押金额:', amount)
      console.log('钱包地址:', this.wallet.address)

      // 检查AS Token余额
      const asBalance = await this.getAsTokenBalance()
      console.log('当前AS Token余额:', asBalance)
      
      if (parseFloat(asBalance) < parseFloat(amount)) {
        throw new Error(`AS Token余额不足: 需要 ${amount} AS, 当前余额 ${asBalance} AS`)
      }

      // 检查并授权AS Token
      console.log('检查AS Token授权...')
      await this.checkAndApproveAsToken(amount)

      const amountWei = ethers.parseUnits(amount, 18)
      console.log('质押金额(Wei):', amountWei.toString())
      
      console.log('调用活期质押合约stake函数...')
      const tx = await this.demandContract.stake(amountWei)
      console.log('质押交易已发送，等待确认...')
      
      return {
        txHash: tx.hash
      }
    } catch (error) {
      console.error('质押失败:', error)
      throw new Error(`质押失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  // 解质押AS Token
  async unstake(amount: string): Promise<{ txHash: string }> {
    if (!this.demandContract || !this.wallet) {
      throw new Error('服务未初始化')
    }

    try {
      console.log('开始解质押AS Token...')
      console.log('解质押金额:', amount)
      console.log('钱包地址:', this.wallet.address)

      const amountWei = ethers.parseUnits(amount, 18)
      console.log('解质押金额(Wei):', amountWei.toString())
      
      console.log('调用活期质押合约unstake函数...')
      const tx = await this.demandContract.unstake(amountWei)
      console.log('解质押交易已发送，等待确认...')
      
      return {
        txHash: tx.hash
      }
    } catch (error) {
      console.error('解质押失败:', error)
      throw new Error(`解质押失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  // 领取奖励
  async claimReward(): Promise<{ txHash: string }> {
    if (!this.demandContract || !this.wallet) {
      throw new Error('服务未初始化')
    }

    try {
      console.log('开始领取奖励...')
      console.log('钱包地址:', this.wallet.address)

      // 检查可领取奖励
      const rewardAmount = await this.getRewardAmount()
      console.log('可领取奖励:', rewardAmount)
      
      if (parseFloat(rewardAmount) <= 0) {
        throw new Error('没有可领取的奖励')
      }

      console.log('调用活期质押合约claimReward函数...')
      const tx = await this.demandContract.claimReward()
      console.log('领取奖励交易已发送，等待确认...')
      
      return {
        txHash: tx.hash
      }
    } catch (error) {
      console.error('领取奖励失败:', error)
      throw new Error(`领取奖励失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  // 等待交易确认
  async waitForTransaction(txHash: string): Promise<ethers.TransactionReceipt> {
    if (!this.provider) {
      throw new Error('服务未初始化')
    }

    try {
      console.log('等待交易确认:', txHash)
      const receipt = await this.provider.waitForTransaction(txHash)
      if (receipt) {
        console.log('交易确认成功，区块号:', receipt.blockNumber)
        return receipt
      } else {
        throw new Error('交易确认失败：receipt为null')
      }
    } catch (error) {
      console.error('等待交易确认失败:', error)
      throw new Error(`交易确认失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }
} 