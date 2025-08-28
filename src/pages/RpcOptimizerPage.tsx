import { useState, useEffect } from 'react'
import { Server, Clock, Zap, Shield, RefreshCw } from 'lucide-react'
import { rpcOptimizer } from '../utils/rpcOptimizer'

export function RpcOptimizerPage() {
  const [nodeStatus, setNodeStatus] = useState<any[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  const refreshNodeStatus = () => {
    setIsRefreshing(true)
    const status = rpcOptimizer.getNodeStatus()
    setNodeStatus(status)
    setIsRefreshing(false)
  }

  useEffect(() => {
    refreshNodeStatus()
    const interval = setInterval(refreshNodeStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">RPC节点优化器</h1>
          <p className="text-gray-600 mt-1">智能负载均衡和缓存管理</p>
        </div>
        <button
          onClick={refreshNodeStatus}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-blue-500" />
            <div>
              <p className="text-sm text-gray-600">总节点数</p>
              <p className="text-xl font-semibold">{nodeStatus.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-green-500" />
            <div>
              <p className="text-sm text-gray-600">健康节点</p>
              <p className="text-xl font-semibold">
                {nodeStatus.filter(node => node.isHealthy).length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-yellow-500" />
            <div>
              <p className="text-sm text-gray-600">平均响应时间</p>
              <p className="text-xl font-semibold">
                {nodeStatus.length > 0 
                  ? `${Math.round(nodeStatus.reduce((sum, node) => sum + node.responseTime, 0) / nodeStatus.length)}ms`
                  : '0ms'
                }
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-purple-500" />
            <div>
              <p className="text-sm text-gray-600">最后更新</p>
              <p className="text-sm font-semibold">
                {new Date().toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">节点状态</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">节点名称</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">响应时间</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">负载</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">错误次数</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {nodeStatus.map((node, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{node.name}</p>
                      <p className="text-xs text-gray-500 truncate">{node.url}</p>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className={`w-2 h-2 rounded-full mr-2 ${
                        node.isHealthy ? 'bg-green-400' : 'bg-red-400'
                      }`} />
                      <span className={`text-sm ${
                        node.isHealthy ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {node.isHealthy ? '健康' : '不健康'}
                      </span>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">
                      {node.responseTime > 0 ? `${Math.round(node.responseTime)}ms` : '未知'}
                    </span>
                  </td>
                  
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">
                      {node.currentRequests}/{node.maxRequestsPerMinute}
                    </span>
                  </td>
                  
                  <td className="px-6 py-4">
                    <span className={`text-sm ${
                      node.errorCount === 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {node.errorCount}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">💡 RPC优化特性</h3>
        <div className="space-y-2 text-sm text-blue-800">
          <p>• <strong>智能负载均衡</strong>：自动选择最佳RPC节点</p>
          <p>• <strong>缓存系统</strong>：余额缓存30秒，Gas价格缓存15秒</p>
          <p>• <strong>健康监控</strong>：自动检测和切换故障节点</p>
          <p>• <strong>请求队列</strong>：限制并发请求，防止过载</p>
        </div>
      </div>
    </div>
  )
} 