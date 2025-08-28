import { ethers } from 'ethers'

export interface TransactionStatus {
  isConfirmed: boolean
  isFailed: boolean
  blockNumber?: number
  gasUsed?: bigint
  gasPrice?: bigint
  error?: string
}

export class TransactionVerifier {
  private provider: ethers.Provider

  constructor(provider: ethers.Provider) {
    this.provider = provider
  }

  // 检查交易状态
  async verifyTransaction(txHash: string): Promise<TransactionStatus> {
    try {
      // 等待交易确认
      const receipt = await this.provider.waitForTransaction(txHash, 1, 30000) // 30秒超时
      
      if (!receipt) {
        return {
          isConfirmed: false,
          isFailed: true,
          error: '交易确认超时'
        }
      }

      return {
        isConfirmed: receipt.status === 1,
        isFailed: receipt.status === 0,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        gasPrice: receipt.gasPrice
      }
    } catch (error) {
      console.error('交易验证失败:', error)
      return {
        isConfirmed: false,
        isFailed: true,
        error: error instanceof Error ? error.message : '交易验证失败'
      }
    }
  }

  // 批量检查交易状态
  async verifyTransactions(txHashes: string[]): Promise<Map<string, TransactionStatus>> {
    const results = new Map<string, TransactionStatus>()
    
    const promises = txHashes.map(async (txHash) => {
      const status = await this.verifyTransaction(txHash)
      results.set(txHash, status)
    })
    
    await Promise.allSettled(promises)
    return results
  }

  // 检查交易是否在区块浏览器上可见
  async checkTransactionOnExplorer(txHash: string): Promise<boolean> {
    try {
      // 尝试获取交易详情
      const tx = await this.provider.getTransaction(txHash)
      return tx !== null
    } catch (error) {
      return false
    }
  }
} 