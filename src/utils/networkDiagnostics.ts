// 网络诊断工具
import { ethers } from 'ethers'
import { rpcOptimizer } from './rpcOptimizer'

export interface NetworkDiagnosticResult {
  timestamp: string
  overallStatus: 'healthy' | 'degraded' | 'failed'
  details: {
    internetConnection: boolean
    rpcNodes: RPCNodeStatus[]
    latency: number
    errors: string[]
  }
}

export interface RPCNodeStatus {
  name: string
  url: string
  isHealthy: boolean
  responseTime: number
  error?: string
  lastCheck: string
}

export class NetworkDiagnostics {
  private static instance: NetworkDiagnostics

  private constructor() {}

  static getInstance(): NetworkDiagnostics {
    if (!NetworkDiagnostics.instance) {
      NetworkDiagnostics.instance = new NetworkDiagnostics()
    }
    return NetworkDiagnostics.instance
  }

  // 执行完整的网络诊断
  async performDiagnostics(): Promise<NetworkDiagnosticResult> {
    // const startTime = Date.now()
    const errors: string[] = []
    
    console.log('🔍 开始网络诊断...')

    // 1. 检查基础网络连接
    const internetConnection = await this.checkInternetConnection()
    if (!internetConnection) {
      errors.push('基础网络连接失败')
    }

    // 2. 检查所有RPC节点
    const rpcNodes = await this.checkAllRPCNodes()
    const healthyNodes = rpcNodes.filter(node => node.isHealthy)
    
    if (healthyNodes.length === 0) {
      errors.push('所有RPC节点都无法连接')
    } else if (healthyNodes.length < rpcNodes.length) {
      errors.push(`${rpcNodes.length - healthyNodes.length}个RPC节点连接失败`)
    }

    // 3. 计算平均延迟
    const latency = healthyNodes.length > 0 
      ? healthyNodes.reduce((sum, node) => sum + node.responseTime, 0) / healthyNodes.length
      : 0

    // 4. 确定整体状态
    let overallStatus: 'healthy' | 'degraded' | 'failed' = 'healthy'
    if (errors.length > 0) {
      overallStatus = healthyNodes.length === 0 ? 'failed' : 'degraded'
    }

    const result: NetworkDiagnosticResult = {
      timestamp: new Date().toISOString(),
      overallStatus,
      details: {
        internetConnection,
        rpcNodes,
        latency,
        errors
      }
    }

    console.log('📊 网络诊断结果:', result)
    return result
  }

  // 检查基础网络连接
  private async checkInternetConnection(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      const response = await fetch('https://httpbin.org/get', {
        signal: controller.signal,
        method: 'GET'
      })
      
      clearTimeout(timeoutId)
      return response.ok
    } catch (error) {
      console.warn('基础网络连接检查失败:', error)
      return false
    }
  }

  // 检查所有RPC节点
  private async checkAllRPCNodes(): Promise<RPCNodeStatus[]> {
    const nodes = rpcOptimizer.getNodeStatus()
    const results: RPCNodeStatus[] = []

    for (const node of nodes) {
      const status = await this.checkRPCNode(node)
      results.push(status)
    }

    return results
  }

  // 检查单个RPC节点
  private async checkRPCNode(node: any): Promise<RPCNodeStatus> {
    const startTime = Date.now()
    
    try {
      const provider = new ethers.JsonRpcProvider(node.url)
      await provider.getBlockNumber()
      const responseTime = Date.now() - startTime

      return {
        name: node.name,
        url: node.url,
        isHealthy: true,
        responseTime,
        lastCheck: new Date().toISOString()
      }
    } catch (error) {
      const responseTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      
      return {
        name: node.name,
        url: node.url,
        isHealthy: false,
        responseTime,
        error: errorMessage,
        lastCheck: new Date().toISOString()
      }
    }
  }

  // 获取诊断报告
  getDiagnosticReport(result: NetworkDiagnosticResult): string {
    const { overallStatus, details } = result
    
    let report = `网络诊断报告 (${result.timestamp})\n`
    report += `整体状态: ${this.getStatusText(overallStatus)}\n\n`
    
    report += `基础网络连接: ${details.internetConnection ? '✅ 正常' : '❌ 失败'}\n`
    report += `平均延迟: ${details.latency.toFixed(0)}ms\n\n`
    
    report += `RPC节点状态:\n`
    details.rpcNodes.forEach(node => {
      const status = node.isHealthy ? '✅' : '❌'
      const latency = node.responseTime > 0 ? ` (${node.responseTime}ms)` : ''
      const error = node.error ? ` - ${node.error}` : ''
      report += `  ${status} ${node.name}${latency}${error}\n`
    })
    
    if (details.errors.length > 0) {
      report += `\n错误信息:\n`
      details.errors.forEach(error => {
        report += `  • ${error}\n`
      })
    }
    
    return report
  }

  private getStatusText(status: string): string {
    switch (status) {
      case 'healthy': return '✅ 健康'
      case 'degraded': return '⚠️ 降级'
      case 'failed': return '❌ 失败'
      default: return '❓ 未知'
    }
  }
}

export const networkDiagnostics = NetworkDiagnostics.getInstance() 