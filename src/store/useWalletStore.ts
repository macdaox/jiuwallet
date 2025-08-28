import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DataBackup } from '../utils/dataBackup'

export interface WalletConfig {
  privateKey: string
  targetAddress: string
  minTransferAmount: string
  gasStrategy: 'fast' | 'standard' | 'safe' | 'custom'
  gasMultiplier?: number
  gasLimit?: string
  crazyMode?: boolean
  isConfigured: boolean
  autoTransfer: boolean
  tokenAddress?: string
  transferType: 'native' | 'token'
  checkInterval?: number
  // 疯狂抢救模式配置
  rescueMode: boolean
  rescueInterval: number
  rescueGasMultiplier: number
  // AkasaDAO配置
  akasdaoEnabled: boolean
  akasdaoMinAmount: string
  akasdaoTokenAddress?: string
}

export interface WalletStatus {
  address: string
  balance: string
  isConnected: boolean
  lastChecked: Date
  tokenInfo?: {
    symbol: string
    name: string
    decimals: number
  }
}

export interface TransferRecord {
  id: string
  fromAddress: string
  toAddress: string
  targetAddress?: string
  amount: string
  txHash: string
  timestamp: Date
  status: 'pending' | 'confirmed' | 'failed'
  type: 'auto' | 'manual' | 'deposit' | 'withdraw' | 'vortex' | 'silence' | 'demand'
  tokenSymbol?: string
  tokenAddress?: string
  error?: string | null
}

export interface LogEntry {
  id: string
  timestamp: Date
  level: 'info' | 'warning' | 'error' | 'success'
  category: 'system' | 'transaction' | 'monitoring' | 'security' | 'transfer' | 'contract' | 'service' | 'balance' | 'stake' | 'unstake' | 'reward' | 'auto' | 'silence' | 'vortex'
  message: string
  details?: string
}

interface WalletStore {
  // 配置相关
  config: WalletConfig
  setConfig: (config: Partial<WalletConfig>) => void
  clearConfig: () => void
  
  // 钱包状态
  walletStatus: WalletStatus | null
  setWalletStatus: (status: Partial<WalletStatus>) => void
  clearWalletStatus: () => void
  
  // 监控状态 - 独立管理不同页面的监控状态
  isMonitoring: boolean
  setMonitoring: (monitoring: boolean) => void
  
  // 协议监控状态 - 新增独立的协议监控状态
  isProtocolMonitoring: boolean
  setProtocolMonitoring: (monitoring: boolean) => void
  
  // 转账记录
  transferRecords: TransferRecord[]
  addTransferRecord: (record: TransferRecord) => void
  updateTransferRecord: (id: string, updates: Partial<TransferRecord>) => void
  clearTransferRecords: () => void
  
  // 日志管理
  logs: LogEntry[]
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void
  clearLogs: () => void
  
  // 错误处理
  error: string | null
  setError: (error: string | null) => void
}

const initialConfig: WalletConfig = {
  privateKey: '',
  targetAddress: '',
  minTransferAmount: '0.001',
  gasStrategy: 'fast',
  gasMultiplier: 1,
  gasLimit: '',
  crazyMode: false,
  isConfigured: false,
  autoTransfer: false,
  tokenAddress: '',
  transferType: 'native',
  checkInterval: 0.5, // 默认0.5秒检查一次，更激进
  // 疯狂抢救模式配置
  rescueMode: false,
  rescueInterval: 100, // 100毫秒检查一次
  rescueGasMultiplier: 3, // 抢救模式默认3倍gas
  // AkasaDAO配置
  akasdaoEnabled: false,
  akasdaoMinAmount: '10',
  akasdaoTokenAddress: ''
}

export const useWalletStore = create<WalletStore>()(persist(
  (set, get) => ({
    // 配置相关
    config: initialConfig,
    setConfig: (newConfig) => {
      set((state) => {
        const updatedConfig = { ...state.config, ...newConfig }
        
        // 自动备份配置
        try {
          DataBackup.autoBackup({
            config: updatedConfig,
            transferRecords: state.transferRecords,
            logs: state.logs.slice(0, 100)
          })
        } catch (error) {
          console.warn('配置备份失败:', error)
        }
        
        return { config: updatedConfig }
      })
      
      // 添加配置更新日志
      get().addLog({
        level: 'info',
        category: 'system',
        message: '配置已更新',
        details: `更新的配置项: ${Object.keys(newConfig).join(', ')}`
      })
    },
    clearConfig: () => {
      set({ config: initialConfig })
      get().addLog({
        level: 'info',
        category: 'system',
        message: '配置已清空'
      })
    },
    
    // 钱包状态
    walletStatus: null,
    setWalletStatus: (status) => {
      set((state) => ({
        walletStatus: state.walletStatus 
          ? { ...state.walletStatus, ...status }
          : {
              address: '',
              balance: '0',
              isConnected: false,
              lastChecked: new Date(),
              ...status
            }
      }))
    },
    clearWalletStatus: () => {
      set({ walletStatus: null })
      get().addLog({
        level: 'info',
        category: 'system',
        message: '钱包状态已清除'
      })
    },
    
    // 监控状态
    isMonitoring: false,
    setMonitoring: (monitoring) => {
      set({ isMonitoring: monitoring })
      get().addLog({
        level: 'info',
        category: 'monitoring',
        message: monitoring ? '开始监控' : '停止监控'
      })
    },
    
    // 协议监控状态 - 新增独立的协议监控状态
    isProtocolMonitoring: false,
    setProtocolMonitoring: (monitoring) => {
      set({ isProtocolMonitoring: monitoring })
      get().addLog({
        level: 'info',
        category: 'monitoring',
        message: monitoring ? '开始协议监控' : '停止协议监控'
      })
    },
    
    // 转账记录
    transferRecords: [],
    addTransferRecord: (record) => {
      set((state) => ({
        transferRecords: [record, ...state.transferRecords]
      }))
      get().addLog({
        level: 'info',
        category: 'transaction',
        message: `新增转账记录: ${record.amount} MATIC`,
        details: `交易哈希: ${record.txHash}`
      })
    },
    updateTransferRecord: (id, updates) => {
      set((state) => ({
        transferRecords: state.transferRecords.map(record =>
          record.id === id ? { ...record, ...updates } : record
        )
      }))
    },
    clearTransferRecords: () => {
      set({ transferRecords: [] })
      get().addLog({
        level: 'info',
        category: 'system',
        message: '转账记录已清空'
      })
    },
    
    // 日志管理
    logs: [],
    addLog: (logData) => {
      const log: LogEntry = {
        ...logData,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        timestamp: new Date()
      }
      set((state) => ({
        logs: [log, ...state.logs].slice(0, 1000) // 保持最新1000条日志
      }))
    },
    clearLogs: () => {
      set({ logs: [] })
    },
    
    // 错误处理
    error: null,
    setError: (error) => {
      set({ error })
      if (error) {
        get().addLog({
          level: 'error',
          category: 'system',
          message: '系统错误',
          details: error
        })
      }
    }
  }),
  {
    name: 'wallet-store',
    // 只持久化配置和转账记录，不持久化敏感的钱包状态和余额缓存
    partialize: (state) => ({
      config: {
        ...state.config,
        privateKey: '' // 不持久化私钥到localStorage
      },
      transferRecords: state.transferRecords,
      logs: state.logs.slice(0, 100) // 只持久化最新100条日志
      // 注意：walletStatus 不持久化，避免余额缓存问题
    }),
    // 处理数据恢复时的日期对象转换
    onRehydrateStorage: () => (state) => {
      if (state) {
        // 恢复转账记录中的日期对象
        if (state.transferRecords) {
          state.transferRecords = state.transferRecords.map(record => ({
            ...record,
            timestamp: new Date(record.timestamp)
          }))
        }
        
        // 恢复日志中的日期对象
        if (state.logs) {
          state.logs = state.logs.map(log => ({
            ...log,
            timestamp: new Date(log.timestamp)
          }))
        }
      }
    }
  }
))