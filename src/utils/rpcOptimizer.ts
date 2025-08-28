import { ethers } from 'ethers'

// RPC节点配置
interface RpcNode {
  url: string
  name: string
  weight: number
  maxRequestsPerMinute: number
  currentRequests: number
  lastResetTime: number
  isHealthy: boolean
  responseTime: number
  errorCount: number
  lastUsed: number
}

export class RpcOptimizer {
  private nodes: RpcNode[] = []
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>()
  private requestQueue: Array<() => Promise<any>> = []
  private activeRequests = 0
  private healthCheckInterval: NodeJS.Timeout | null = null

  constructor() {
    this.initializeNodes()
    this.startHealthCheck()
  }

  // 初始化RPC节点
  private initializeNodes(): void {
    this.nodes = [
      {
        url: 'https://polygon-rpc.com',
        name: 'Polygon RPC',
        weight: 3,
        maxRequestsPerMinute: 100,
        currentRequests: 0,
        lastResetTime: Date.now(),
        isHealthy: true,
        responseTime: 0,
        errorCount: 0,
        lastUsed: 0
      },
      {
        url: 'https://polygon-rpc.publicnode.com',
        name: 'PublicNode',
        weight: 2,
        maxRequestsPerMinute: 60,
        currentRequests: 0,
        lastResetTime: Date.now(),
        isHealthy: true,
        responseTime: 0,
        errorCount: 0,
        lastUsed: 0
      },
      {
        url: 'https://polygon.llamarpc.com',
        name: 'LlamaRPC',
        weight: 2,
        maxRequestsPerMinute: 80,
        currentRequests: 0,
        lastResetTime: Date.now(),
        isHealthy: true,
        responseTime: 0,
        errorCount: 0,
        lastUsed: 0
      },
      {
        url: 'https://polygon.drpc.org',
        name: 'DRPC',
        weight: 1,
        maxRequestsPerMinute: 50,
        currentRequests: 0,
        lastResetTime: Date.now(),
        isHealthy: true,
        responseTime: 0,
        errorCount: 0,
        lastUsed: 0
      }
    ]
  }



  // 缓存管理
  private getCacheKey(operation: string, params: any[]): string {
    return `${operation}:${JSON.stringify(params)}`
  }

  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key)
    if (!cached) return null

    if (Date.now() - cached.timestamp > cached.ttl) {
      this.cache.delete(key)
      return null
    }

    return cached.data as T
  }

  private setCache(key: string, data: any, ttl: number): void {
    if (this.cache.size >= 1000) {
      const now = Date.now()
      for (const [k, v] of this.cache.entries()) {
        if (now - v.timestamp > v.ttl) {
          this.cache.delete(k)
        }
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    })
  }

  // 清理特定操作的缓存
  private clearCacheForOperation(operation: string): void {
    const keysToDelete: string[] = []
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${operation}:`)) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key))
    console.log(`🗑️ 清理了 ${keysToDelete.length} 个 ${operation} 缓存`)
  }

  // 执行RPC请求（带重试机制）
  async executeRequest<T>(
    operation: string,
    params: any[],
    cacheTime: number = 30000
  ): Promise<T> {
    const cacheKey = this.getCacheKey(operation, params)
    
    // 如果cacheTime为0，跳过缓存直接查询
    if (cacheTime > 0) {
      const cached = this.getFromCache<T>(cacheKey)
      if (cached !== null) {
        console.log(`📦 从缓存获取: ${operation}`)
        return cached
      }
    }

    // 获取所有健康节点
    const healthyNodes = this.nodes.filter(node => node.isHealthy)
    if (healthyNodes.length === 0) {
      throw new Error('没有可用的RPC节点，请稍后重试')
    }

    let lastError: Error | null = null

    // 尝试所有健康节点
    for (const node of healthyNodes) {
      await this.waitForQueueSlot()

      const provider = new ethers.JsonRpcProvider(node.url)
      
      const startTime = Date.now()
      node.currentRequests++
      node.lastUsed = Date.now()

      try {
        console.log(`🌐 使用节点 ${node.name} 执行: ${operation}`)
        
        let result: T
        
        switch (operation) {
          case 'getBalance':
            result = await provider.getBalance(params[0]) as T
            break
          case 'getGasPrice':
            result = await provider.getFeeData() as T
            break
          case 'getTokenInfo': {
            const contract = new ethers.Contract(params[0], [
              'function name() view returns (string)',
              'function symbol() view returns (string)',
              'function decimals() view returns (uint8)'
            ], provider)
            const [name, symbol, decimals] = await Promise.all([
              contract.name(),
              contract.symbol(),
              contract.decimals()
            ])
            result = { name, symbol, decimals: Number(decimals) } as T
            break
          }
          case 'getTokenBalance': {
            const tokenContract = new ethers.Contract(params[0], [
              'function balanceOf(address) view returns (uint256)'
            ], provider)
            result = await tokenContract.balanceOf(params[1]) as T
            break
          }
          default:
            throw new Error(`未知操作: ${operation}`)
        }

        // 更新节点状态
        const responseTime = Date.now() - startTime
        node.responseTime = (node.responseTime + responseTime) / 2
        node.errorCount = Math.max(0, node.errorCount - 1)

        // 只有当cacheTime > 0时才缓存结果
        if (cacheTime > 0) {
          this.setCache(cacheKey, result, cacheTime)
        }

        console.log(`✅ ${operation} 请求成功，使用节点: ${node.name}`)
        return result

      } catch (error) {
        lastError = error as Error
        node.errorCount++
        node.responseTime = node.responseTime * 1.5
        
        console.warn(`❌ 节点 ${node.name} 请求失败: ${error instanceof Error ? error.message : '未知错误'}`)
        
        if (node.errorCount >= 3) {
          node.isHealthy = false
          console.warn(`⚠️ 节点 ${node.name} 标记为不健康`)
        }
      } finally {
        this.activeRequests--
        this.processQueue()
      }
    }

    // 所有节点都失败了
    console.error(`❌ 所有RPC节点都失败了，最后错误: ${lastError?.message}`)
    throw new Error(`网络请求失败: ${lastError?.message || '未知错误'}`)
  }

  // 等待队列位置
  private async waitForQueueSlot(): Promise<void> {
    if (this.activeRequests >= 5) {
      return new Promise(resolve => {
        this.requestQueue.push(async () => {
          this.activeRequests++
          resolve()
        })
      })
    }
    
    this.activeRequests++
  }

  // 处理队列
  private processQueue(): void {
    if (this.requestQueue.length > 0 && this.activeRequests < 5) {
      const nextRequest = this.requestQueue.shift()
      if (nextRequest) {
        nextRequest()
      }
    }
  }

  // 健康检查
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck()
    }, 60000)
  }

  private async performHealthCheck(): Promise<void> {
    console.log('🏥 开始RPC节点健康检查...')
    
    for (const node of this.nodes) {
      if (!node.isHealthy) {
        try {
          const provider = new ethers.JsonRpcProvider(node.url)
          const startTime = Date.now()
          await provider.getBlockNumber()
          const responseTime = Date.now() - startTime
          
          if (responseTime < 5000) {
            node.isHealthy = true
            node.errorCount = 0
            node.responseTime = responseTime
            console.log(`✅ 节点 ${node.name} 恢复健康`)
          }
        } catch (error) {
          console.log(`❌ 节点 ${node.name} 健康检查失败`)
        }
      }
    }
  }

  // 公共API方法
  async getBalance(address: string, _cacheTime?: number): Promise<string> {
    // 强制清除余额缓存，确保获取最新数据
    this.clearCacheForOperation('getBalance')
    
    // 清除所有相关缓存
    const keysToDelete: string[] = []
    for (const key of this.cache.keys()) {
      if (key.includes('getBalance') || key.includes(address)) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key))
    
    console.log(`🗑️ 清理了 ${keysToDelete.length} 个余额相关缓存`)
    
    const balance = await this.executeRequest<bigint>('getBalance', [address], 0)
    return ethers.formatEther(balance)
  }

  async getGasPrice(cacheTime?: number): Promise<ethers.FeeData> {
    return this.executeRequest<ethers.FeeData>('getGasPrice', [], cacheTime || 15000)
  }

  async getTokenInfo(tokenAddress: string, cacheTime?: number): Promise<{ name: string; symbol: string; decimals: number }> {
    return this.executeRequest<{ name: string; symbol: string; decimals: number }>('getTokenInfo', [tokenAddress], cacheTime || 300000)
  }

  async getTokenBalance(tokenAddress: string, address: string, cacheTime?: number): Promise<bigint> {
    // 清理旧的余额缓存，确保获取最新数据
    this.clearCacheForOperation('getTokenBalance')
    return this.executeRequest<bigint>('getTokenBalance', [tokenAddress, address], cacheTime || 0)
  }

  // 获取节点状态
  getNodeStatus(): RpcNode[] {
    return this.nodes.map(node => ({ ...node }))
  }

  // 清除缓存
  clearCache(): void {
    console.log('🧹 清除RPC缓存')
    this.cache.clear()
  }

  // 清理资源
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }
    this.cache.clear()
  }
}

// 创建全局实例
export const rpcOptimizer = new RpcOptimizer() 