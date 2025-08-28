// Polygon网络上的代币合约地址
export const TOKEN_ADDRESSES = {
  // DAI代币在Polygon上的合约地址
  DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  
  // USDC代币在Polygon上的合约地址
  USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  
  // USDT代币在Polygon上的合约地址
  USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  
  // WETH代币在Polygon上的合约地址
  WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'
}

// 代币信息
export const TOKEN_INFO = {
  [TOKEN_ADDRESSES.DAI]: {
    name: 'Dai Stablecoin',
    symbol: 'DAI',
    decimals: 18,
    logo: 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.png'
  },
  [TOKEN_ADDRESSES.USDC]: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    logo: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png'
  },
  [TOKEN_ADDRESSES.USDT]: {
    name: 'Tether USD',
    symbol: 'USDT',
    decimals: 6,
    logo: 'https://cryptologos.cc/logos/tether-usdt-logo.png'
  },
  [TOKEN_ADDRESSES.WETH]: {
    name: 'Wrapped Ether',
    symbol: 'WETH',
    decimals: 18,
    logo: 'https://cryptologos.cc/logos/ethereum-eth-logo.png'
  }
}

// 获取代币信息
export const getTokenInfo = (address: string) => {
  return TOKEN_INFO[address] || null
}

// 检查是否是支持的代币
export const isSupportedToken = (address: string) => {
  return Object.values(TOKEN_ADDRESSES).includes(address)
} 