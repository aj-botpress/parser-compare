import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { FileText } from 'lucide-react'
import { useRoute } from '@/lib/router'
import { getHistorySummaries, type HistorySummary } from '@/lib/history'
import { HomePage } from './pages/HomePage'
import { RunDetailPage } from './pages/RunDetailPage'
import './index.css'

type HealthStatus = 'loading' | 'configured' | 'missing_credentials' | 'error'

export function App() {
  const route = useRoute()

  // Health state
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('loading')

  // History state (shared between pages)
  const [historySummaries, setHistorySummaries] = useState<HistorySummary[]>([])

  // Check health on mount
  useEffect(() => {
    fetch('/api/botpress/health')
      .then((res) => res.json())
      .then((data) => {
        setHealthStatus(data.status === 'configured' ? 'configured' : 'missing_credentials')
      })
      .catch(() => setHealthStatus('error'))
  }, [])

  // Load history on mount
  useEffect(() => {
    setHistorySummaries(getHistorySummaries())
  }, [])

  // Refresh history callback
  const refreshHistory = () => {
    setHistorySummaries(getHistorySummaries())
  }

  // Render page based on route
  const renderPage = () => {
    switch (route.page) {
      case 'home':
        return (
          <HomePage
            healthStatus={healthStatus}
            onHistoryChange={refreshHistory}
            historySummaries={historySummaries}
          />
        )
      case 'detail':
        return <RunDetailPage runId={route.runId} onHistoryChange={refreshHistory} />
      case 'not-found':
        return (
          <div className="text-center py-20">
            <h2 className="text-xl font-semibold mb-2">Page Not Found</h2>
            <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
          </div>
        )
    }
  }

  // Detail page needs more width for 3-column layout
  const isDetailPage = route.page === 'detail'

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <h1 className="font-semibold text-lg">Files Parsing Benchmark</h1>
          </div>

          <Badge variant={healthStatus === 'configured' ? 'success' : 'destructive'}>
            {healthStatus === 'loading'
              ? 'Checking...'
              : healthStatus === 'configured'
                ? 'Configured'
                : 'Not Configured'}
          </Badge>
        </div>
      </header>

      <main className={isDetailPage ? 'px-6 py-6' : 'container mx-auto px-4 py-6'}>
        {renderPage()}
      </main>
    </div>
  )
}

export default App
