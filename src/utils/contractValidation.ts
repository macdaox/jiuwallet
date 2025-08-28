import { ethers } from 'ethers'

// 合约验证结果接口
export interface ContractValidationResult {
  isValid: boolean
  contractType?: string
  name?: string
  symbol?: string
  decimals?: number
  error?: string
}

// 验证过的合约缓存接口
export interface ValidatedContract {
  address: string
  isValid: boolean
  contractType: string
  name?: string
  symbol?: string
  decimals?: number
  validatedAt: string
  networkId: number
}

// 存储验证过的合约地址
export function storeValidatedContract(
  address: string, 
  result: ContractValidationResult, 
  networkId: number
): void {
  try {
    const validatedContracts = getValidatedContracts()
    
    const validatedContract: ValidatedContract = {
      address: address.toLowerCase(),
      isValid: result.isValid,
      contractType: result.contractType || 'unknown',
      name: result.name,
      symbol: result.symbol,
      decimals: result.decimals,
      validatedAt: new Date().toISOString(),
      networkId
    }
    
    // 更新或添加验证结果
    validatedContracts[address.toLowerCase()] = validatedContract
    
    localStorage.setItem('validated_contracts', JSON.stringify(validatedContracts))
  } catch (error) {
    console.error('存储合约验证结果失败:', error)
  }
}

// 获取所有验证过的合约
export function getValidatedContracts(): Record<string, ValidatedContract> {
  try {
    const stored = localStorage.getItem('validated_contracts')
    return stored ? JSON.parse(stored) : {}
  } catch (error) {
    console.error('获取验证过的合约失败:', error)
    return {}
  }
}

// 检查合约是否已验证
export function isContractValidated(address: string, networkId: number): boolean {
  try {
    const validatedContracts = getValidatedContracts()
    const contract = validatedContracts[address.toLowerCase()]
    
    if (!contract) return false
    
    // 检查是否在同一网络验证过
    if (contract.networkId !== networkId) return false
    
    // 检查验证时间是否在24小时内
    const validatedAt = new Date(contract.validatedAt)
    const now = new Date()
    const hoursDiff = (now.getTime() - validatedAt.getTime()) / (1000 * 60 * 60)
    
    return hoursDiff < 24 && contract.isValid
  } catch (error) {
    console.error('检查合约验证状态失败:', error)
    return false
  }
}

// 获取验证过的合约信息
export function getValidatedContractInfo(address: string, networkId: number): ValidatedContract | null {
  try {
    const validatedContracts = getValidatedContracts()
    const contract = validatedContracts[address.toLowerCase()]
    
    if (!contract || contract.networkId !== networkId) return null
    
    return contract
  } catch (error) {
    console.error('获取验证过的合约信息失败:', error)
    return null
  }
}

// 验证合约地址
export async function validateContractAddress(
  address: string, 
  provider: ethers.JsonRpcProvider
): Promise<ContractValidationResult> {
  try {
    // 基本地址格式验证
    if (!ethers.isAddress(address)) {
      return {
        isValid: false,
        error: '无效的合约地址格式'
      }
    }

    // 检查地址是否有代码
    const code = await provider.getCode(address)
    if (code === '0x') {
      return {
        isValid: false,
        error: '地址不是合约'
      }
    }

    // 尝试获取合约信息
    const contract = new ethers.Contract(address, [
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)',
      'function totalSupply() view returns (uint256)',
      'function balanceOf(address owner) view returns (uint256)',
      'function owner() view returns (address)',
      'function getOwner() view returns (address)'
    ], provider)

    try {
      // 尝试调用合约函数来确定类型
      const [name, symbol, decimals] = await Promise.all([
        contract.name().catch(() => null),
        contract.symbol().catch(() => null),
        contract.decimals().catch(() => null)
      ])

      if (name && symbol && decimals !== null) {
        // 这是一个ERC-20代币合约
        return {
          isValid: true,
          contractType: 'ERC20',
          name,
          symbol,
          decimals: Number(decimals)
        }
      }

      // 尝试检查是否是其他类型的合约
      const owner = await contract.owner().catch(() => 
        contract.getOwner().catch(() => null)
      )

      if (owner) {
        return {
          isValid: true,
          contractType: 'Ownable',
          name: name || 'Unknown Contract'
        }
      }

      // 如果无法确定具体类型，但地址有代码，认为是有效合约
      return {
        isValid: true,
        contractType: 'Unknown',
        name: 'Unknown Contract'
      }

    } catch (error) {
      // 如果无法调用合约函数，但地址有代码，认为是有效合约
      return {
        isValid: true,
        contractType: 'Unknown',
        name: 'Unknown Contract'
      }
    }

  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : '验证失败'
    }
  }
}

// 清除过期的验证记录
export function clearExpiredValidations(): void {
  try {
    const validatedContracts = getValidatedContracts()
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    const filteredContracts: Record<string, ValidatedContract> = {}
    
    Object.entries(validatedContracts).forEach(([address, contract]) => {
      const validatedAt = new Date(contract.validatedAt)
      if (validatedAt > oneDayAgo) {
        filteredContracts[address] = contract
      }
    })
    
    localStorage.setItem('validated_contracts', JSON.stringify(filteredContracts))
  } catch (error) {
    console.error('清除过期验证记录失败:', error)
  }
}

// 清除所有验证记录
export function clearAllValidations(): void {
  try {
    localStorage.removeItem('validated_contracts')
  } catch (error) {
    console.error('清除所有验证记录失败:', error)
  }
} 