import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Settings, Activity, FileText, TrendingUp, Server, Database, DollarSign } from 'lucide-react'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation()

  const navItems = [
    { path: '/config', label: '配置', icon: Settings },
    { path: '/monitor', label: '监控', icon: Activity },
    { path: '/akasdao', label: 'Silence协议', icon: TrendingUp },
    { path: '/akasdao-demand', label: '活期质押', icon: DollarSign },
    { path: '/rpc-optimizer', label: 'RPC优化', icon: Server },
    { path: '/data', label: '数据管理', icon: Database },
    { path: '/logs', label: '日志', icon: FileText },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 to-primary-800">
      {/* 顶部导航栏 */}
      <nav className="bg-primary-800 border-b border-primary-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-white">
                Polygon 钱包抢救程序
              </h1>
            </div>
            <div className="flex space-x-8">
              {navItems.map(({ path, label, icon: Icon }) => {
                const isActive = location.pathname === path
                return (
                  <Link
                    key={path}
                    to={path}
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200 ${
                      isActive
                        ? 'border-secondary-500 text-white'
                        : 'border-transparent text-primary-200 hover:text-white hover:border-primary-300'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </nav>

      {/* 主要内容区域 */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {children}
        </div>
      </main>
    </div>
  )
}