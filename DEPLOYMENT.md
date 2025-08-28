# Vercel 部署指南

## 项目概述
这是一个基于 React + TypeScript + Vite 的 Polygon 钱包救援工具，用于监控和自动转移 DAI 代币。

## 部署到 Vercel

### 方法一：通过 Vercel CLI（推荐）

1. **安装 Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **登录 Vercel**
   ```bash
   vercel login
   ```

3. **部署项目**
   ```bash
   vercel
   ```

4. **生产环境部署**
   ```bash
   vercel --prod
   ```

### 方法二：通过 GitHub 集成

1. **推送代码到 GitHub**
   ```bash
   git add .
   git commit -m "准备部署到 Vercel"
   git push origin main
   ```

2. **在 Vercel 控制台导入项目**
   - 访问 [vercel.com](https://vercel.com)
   - 点击 "New Project"
   - 选择你的 GitHub 仓库
   - 配置构建设置：
     - Framework Preset: Vite
     - Build Command: `npm run build`
     - Output Directory: `dist`
     - Install Command: `npm install`

### 方法三：通过 Vercel Dashboard

1. 访问 [vercel.com](https://vercel.com)
2. 点击 "New Project"
3. 选择 "Import Git Repository"
4. 选择你的仓库
5. 配置构建设置（同上）

## 环境变量配置

在 Vercel 控制台中设置以下环境变量（如果需要）：

```bash
# 区块链网络配置
VITE_NETWORK_ID=137
VITE_NETWORK_NAME=Polygon

# RPC 节点配置
VITE_RPC_URLS=https://polygon-rpc.com,https://rpc-mainnet.matic.network

# 合约地址
VITE_TOKEN_ADDRESS=0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063
```

## 构建配置

项目已配置以下构建优化：

- **代码分割**: 将 vendor、ethers、UI 库分别打包
- **压缩**: 使用 Terser 进行代码压缩
- **缓存优化**: 静态资源使用哈希命名
- **路由配置**: 所有路由都指向 index.html（SPA 模式）

## 部署检查清单

- [ ] 代码已推送到 Git 仓库
- [ ] package.json 中的构建脚本正确
- [ ] vite.config.ts 配置正确
- [ ] vercel.json 配置文件存在
- [ ] .vercelignore 文件配置正确
- [ ] 环境变量已设置（如需要）

## 常见问题

### 1. 构建失败
- 检查 TypeScript 错误：`npm run check`
- 检查 ESLint 错误：`npm run lint`
- 确保所有依赖已安装

### 2. 路由问题
- 确保 vercel.json 中的路由配置正确
- 检查 React Router 配置

### 3. 环境变量问题
- 在 Vercel 控制台中设置环境变量
- 确保变量名以 `VITE_` 开头

### 4. 性能优化
- 代码已配置代码分割
- 静态资源已优化
- 考虑启用 Vercel 的 CDN 缓存

## 监控和维护

部署后建议：

1. **设置监控**: 在 Vercel 控制台启用性能监控
2. **错误追踪**: 集成错误追踪服务（如 Sentry）
3. **定期更新**: 保持依赖包更新
4. **备份**: 定期备份重要配置

## 联系支持

如果遇到部署问题：
- 查看 Vercel 构建日志
- 检查项目配置
- 参考 Vercel 官方文档 