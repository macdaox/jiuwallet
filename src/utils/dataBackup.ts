import { encryptData, decryptData } from './encryption'

// 数据备份和恢复工具
export class DataBackup {
  private static readonly BACKUP_KEY = 'wallet-data-backup'
  private static readonly BACKUP_TIMESTAMP_KEY = 'wallet-backup-timestamp'
  
  // 创建数据备份
  static createBackup(data: any): string {
    try {
      const backupData = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        data: data
      }
      
      const jsonData = JSON.stringify(backupData)
      const encryptedData = encryptData(jsonData)
      
      // 保存到localStorage
      localStorage.setItem(this.BACKUP_KEY, encryptedData)
      localStorage.setItem(this.BACKUP_TIMESTAMP_KEY, new Date().toISOString())
      
      console.log('✅ 数据备份已创建:', new Date().toISOString())
      return encryptedData
    } catch (error) {
      console.error('❌ 创建备份失败:', error)
      throw new Error('备份创建失败')
    }
  }
  
  // 恢复数据备份
  static restoreBackup(encryptedData?: string): any {
    try {
      const dataToDecrypt = encryptedData || localStorage.getItem(this.BACKUP_KEY)
      
      if (!dataToDecrypt) {
        throw new Error('没有找到备份数据')
      }
      
      const decryptedData = decryptData(dataToDecrypt)
      const backupData = JSON.parse(decryptedData)
      
      console.log('✅ 数据备份已恢复:', backupData.timestamp)
      return backupData.data
    } catch (error) {
      console.error('❌ 恢复备份失败:', error)
      throw new Error('备份恢复失败')
    }
  }
  
  // 导出备份文件
  static exportBackup(): void {
    try {
      const backupData = localStorage.getItem(this.BACKUP_KEY)
      if (!backupData) {
        throw new Error('没有找到备份数据')
      }
      
      const timestamp = new Date().toISOString().split('T')[0]
      const filename = `wallet-backup-${timestamp}.json`
      
      const blob = new Blob([backupData], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      console.log('✅ 备份文件已导出:', filename)
    } catch (error) {
      console.error('❌ 导出备份失败:', error)
      throw new Error('备份导出失败')
    }
  }
  
  // 导入备份文件
  static importBackup(file: File): Promise<any> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        try {
          const encryptedData = e.target?.result as string
          const data = this.restoreBackup(encryptedData)
          
          // 保存到localStorage
          localStorage.setItem(this.BACKUP_KEY, encryptedData)
          localStorage.setItem(this.BACKUP_TIMESTAMP_KEY, new Date().toISOString())
          
          console.log('✅ 备份文件已导入')
          resolve(data)
        } catch (error) {
          console.error('❌ 导入备份失败:', error)
          reject(new Error('备份导入失败'))
        }
      }
      
      reader.onerror = () => {
        reject(new Error('文件读取失败'))
      }
      
      reader.readAsText(file)
    })
  }
  
  // 获取备份信息
  static getBackupInfo(): { exists: boolean; timestamp?: string } {
    const backupExists = !!localStorage.getItem(this.BACKUP_KEY)
    const timestamp = localStorage.getItem(this.BACKUP_TIMESTAMP_KEY)
    
    return {
      exists: backupExists,
      timestamp: timestamp || undefined
    }
  }
  
  // 清除备份
  static clearBackup(): void {
    localStorage.removeItem(this.BACKUP_KEY)
    localStorage.removeItem(this.BACKUP_TIMESTAMP_KEY)
    console.log('✅ 备份数据已清除')
  }
  
  // 自动备份当前数据
  static autoBackup(data: any): void {
    try {
      this.createBackup(data)
      console.log('✅ 自动备份完成')
    } catch (error) {
      console.warn('⚠️ 自动备份失败:', error)
    }
  }
} 