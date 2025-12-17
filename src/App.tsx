import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Download, FileUp, Trash2, FileText } from 'lucide-react'
import { useRoute } from '@/lib/router'
import {
  getHistorySummaries,
  clearHistory,
  exportHistory,
  importHistory,
  type HistorySummary,
} from '@/lib/history'
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

  // Import dialog
  const importInputRef = useRef<HTMLInputElement>(null)

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

  // History actions
  const handleExportHistory = () => {
    const json = exportHistory()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `parser-benchmark-history-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportHistory = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const result = importHistory(reader.result as string)
      if (result) {
        refreshHistory()
      }
    }
    reader.readAsText(file)
    // Reset input so same file can be imported again
    e.target.value = ''
  }

  const handleClearHistory = () => {
    clearHistory()
    refreshHistory()
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

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <h1 className="font-semibold text-lg">Files Parsing Benchmark</h1>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant={healthStatus === 'configured' ? 'success' : 'destructive'}>
              {healthStatus === 'loading'
                ? 'Checking...'
                : healthStatus === 'configured'
                  ? 'Configured'
                  : 'Not Configured'}
            </Badge>
            <Separator orientation="vertical" className="h-6" />
            <Button variant="ghost" size="sm" onClick={handleExportHistory}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Button variant="ghost" size="sm" onClick={() => importInputRef.current?.click()}>
              <FileUp className="h-4 w-4 mr-1" />
              Import
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportHistory}
            />
            <Button variant="ghost" size="sm" onClick={handleClearHistory}>
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">{renderPage()}</main>
    </div>
  )
}

export default App
