import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ConfigPage } from './pages/ConfigPage'
import { MonitorPage } from './pages/MonitorPage'
import { LogsPage } from './pages/LogsPage'
import { AkasdaoPage } from './pages/AkasdaoPage'
import { AkasdaoDemandPage } from './pages/AkasdaoDemandPage'
import { RpcOptimizerPage } from './pages/RpcOptimizerPage'
import { DataPage } from './pages/DataPage'
import './index.css'

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Layout>
          <Routes>
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/monitor" element={<MonitorPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/akasdao" element={<AkasdaoPage />} />
            <Route path="/akasdao-demand" element={<AkasdaoDemandPage />} />
            <Route path="/rpc-optimizer" element={<RpcOptimizerPage />} />
            <Route path="/data" element={<DataPage />} />
            <Route path="/" element={<Navigate to="/config" replace />} />
          </Routes>
        </Layout>
      </Router>
    </ErrorBoundary>
  )
}

export default App