import CryptoJS from 'crypto-js'

// 生成随机密钥
function generateKey(): string {
  return CryptoJS.lib.WordArray.random(256/8).toString()
}

// 生成用户密码派生密钥
function deriveKeyFromPassword(password: string, salt: string): string {
  return CryptoJS.PBKDF2(password, salt, {
    keySize: 256/32,
    iterations: 10000
  }).toString()
}

// 获取或创建加密密钥
function getEncryptionKey(): string {
  let key = localStorage.getItem('wallet_encryption_key')
  if (!key) {
    key = generateKey()
    localStorage.setItem('wallet_encryption_key', key)
  }
  return key
}

// 使用密码加密数据
export function encryptDataWithPassword(data: string, password: string): string {
  try {
    const salt = CryptoJS.lib.WordArray.random(128/8).toString()
    const key = deriveKeyFromPassword(password, salt)
    const encrypted = CryptoJS.AES.encrypt(data, key).toString()
    return `${salt}:${encrypted}`
  } catch (error) {
    console.error('加密失败:', error)
    throw new Error('数据加密失败')
  }
}

// 使用密码解密数据
export function decryptDataWithPassword(encryptedData: string, password: string): string {
  try {
    const [salt, encrypted] = encryptedData.split(':')
    const key = deriveKeyFromPassword(password, salt)
    const decrypted = CryptoJS.AES.decrypt(encrypted, key)
    const originalData = decrypted.toString(CryptoJS.enc.Utf8)
    
    if (!originalData) {
      throw new Error('解密失败，可能是密码错误')
    }
    
    return originalData
  } catch (error) {
    console.error('解密失败:', error)
    throw new Error('数据解密失败')
  }
}

// 加密数据
export function encryptData(data: string): string {
  try {
    const key = getEncryptionKey()
    const encrypted = CryptoJS.AES.encrypt(data, key).toString()
    return encrypted
  } catch (error) {
    console.error('加密失败:', error)
    throw new Error('数据加密失败')
  }
}

// 解密数据
export function decryptData(encryptedData: string): string {
  try {
    const key = getEncryptionKey()
    const decrypted = CryptoJS.AES.decrypt(encryptedData, key)
    const originalData = decrypted.toString(CryptoJS.enc.Utf8)
    
    if (!originalData) {
      throw new Error('解密失败，可能是密钥不匹配')
    }
    
    return originalData
  } catch (error) {
    console.error('解密失败:', error)
    throw new Error('数据解密失败')
  }
}

// 安全存储私钥（持久化）
export function storePrivateKey(privateKey: string, password?: string): void {
  try {
    let encrypted: string
    
    if (password) {
      // 使用用户密码加密
      encrypted = encryptDataWithPassword(privateKey, password)
      localStorage.setItem('encrypted_private_key_password', encrypted)
      localStorage.setItem('private_key_protected', 'true')
    } else {
      // 使用自动生成的密钥加密
      encrypted = encryptData(privateKey)
      localStorage.setItem('encrypted_private_key', encrypted)
      localStorage.setItem('private_key_protected', 'false')
    }
    
    // 存储私钥导入时间
    localStorage.setItem('private_key_import_time', new Date().toISOString())
  } catch (error) {
    console.error('私钥存储失败:', error)
    throw new Error('私钥存储失败')
  }
}

// 获取私钥
export function getPrivateKey(password?: string): string | null {
  try {
    const isProtected = localStorage.getItem('private_key_protected') === 'true'
    
    if (isProtected) {
      // 需要密码解密
      if (!password) {
        throw new Error('需要密码来解密私钥')
      }
      const encrypted = localStorage.getItem('encrypted_private_key_password')
      if (!encrypted) {
        return null
      }
      return decryptDataWithPassword(encrypted, password)
    } else {
      // 使用自动密钥解密
      const encrypted = localStorage.getItem('encrypted_private_key')
      if (!encrypted) {
        return null
      }
      return decryptData(encrypted)
    }
  } catch (error) {
    console.error('私钥获取失败:', error)
    return null
  }
}

// 检查私钥是否存在
export function hasStoredPrivateKey(): boolean {
  const isProtected = localStorage.getItem('private_key_protected') === 'true'
  if (isProtected) {
    return !!localStorage.getItem('encrypted_private_key_password')
  } else {
    return !!localStorage.getItem('encrypted_private_key')
  }
}

// 检查私钥是否需要密码
export function isPrivateKeyProtected(): boolean {
  return localStorage.getItem('private_key_protected') === 'true'
}

// 获取私钥导入时间
export function getPrivateKeyImportTime(): Date | null {
  const timeStr = localStorage.getItem('private_key_import_time')
  return timeStr ? new Date(timeStr) : null
}

// 清除私钥
export function clearPrivateKey(): void {
  localStorage.removeItem('encrypted_private_key')
  localStorage.removeItem('encrypted_private_key_password')
  localStorage.removeItem('wallet_encryption_key')
  localStorage.removeItem('private_key_protected')
  localStorage.removeItem('private_key_import_time')
}

// 验证私钥格式
export function validatePrivateKey(privateKey: string): boolean {
  // 移除可能的0x前缀
  const cleanKey = privateKey.replace(/^0x/, '')
  
  // 检查长度（64个十六进制字符）
  if (cleanKey.length !== 64) {
    return false
  }
  
  // 检查是否为有效的十六进制字符串
  const hexRegex = /^[0-9a-fA-F]+$/
  return hexRegex.test(cleanKey)
}

// 验证以太坊地址格式
export function validateAddress(address: string): boolean {
  // 基本格式检查
  if (!address.startsWith('0x')) {
    return false
  }
  
  // 检查长度（42个字符：0x + 40个十六进制字符）
  if (address.length !== 42) {
    return false
  }
  
  // 检查是否为有效的十六进制字符串
  const hexRegex = /^0x[0-9a-fA-F]{40}$/
  return hexRegex.test(address)
}

// 格式化私钥（确保有0x前缀）
export function formatPrivateKey(privateKey: string): string {
  const cleanKey = privateKey.replace(/^0x/, '')
  return `0x${cleanKey}`
}

// 格式化地址（确保有0x前缀且为小写）
export function formatAddress(address: string): string {
  return address.toLowerCase()
}