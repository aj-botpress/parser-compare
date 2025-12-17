import { useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Upload,
  Play,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNavigate } from '@/lib/router'
import {
  addToHistory,
  getHistorySummaries,
  type HistorySummary,
} from '@/lib/history'
import type { BenchmarkRunResult } from '../server/types'

interface HomePageProps {
  healthStatus: 'loading' | 'configured' | 'missing_credentials' | 'error'
  onHistoryChange: () => void
  historySummaries: HistorySummary[]
}

export function HomePage({ healthStatus, onHistoryChange, historySummaries }: HomePageProps) {
  const navigate = useNavigate()

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Benchmark state
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // File handling
  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file)
    setError(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFileSelect(file)
    },
    [handleFileSelect]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Run benchmark
  const runBenchmark = async () => {
    if (!selectedFile) return

    setIsRunning(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const res = await fetch('/api/botpress/benchmark', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Benchmark failed')
      }

      const result: BenchmarkRunResult = await res.json()

      // Save to history
      addToHistory(result)
      onHistoryChange()

      // Navigate to detail page
      navigate(`/runs/${result.runId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Benchmark failed')
    } finally {
      setIsRunning(false)
    }
  }

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      {/* Main content - Upload */}
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">Upload Document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Dropzone */}
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50',
                selectedFile && 'border-primary/50 bg-primary/5'
              )}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.md"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText className="h-8 w-8 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatSize(selectedFile.size)}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Drag & drop a file here, or click to select
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, DOC, DOCX, TXT, MD</p>
                </>
              )}
            </div>

            {/* Benchmark button */}
            <div className="flex gap-2">
              <Button
                onClick={runBenchmark}
                disabled={!selectedFile || isRunning || healthStatus !== 'configured'}
                className="flex-1"
              >
                {isRunning ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {isRunning ? 'Running Benchmark...' : 'Run Benchmark'}
              </Button>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                {error}
              </div>
            )}

            {healthStatus !== 'configured' && healthStatus !== 'loading' && (
              <div className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded">
                Configure BOTPRESS_TOKEN and BOTPRESS_BOT_ID in .env to enable benchmarking.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* History sidebar */}
      <div>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-280px)]">
              {historySummaries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8 px-4">
                  No benchmark history yet
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {historySummaries.map((entry) => (
                    <button
                      key={entry.runId}
                      className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                      onClick={() => navigate(`/runs/${entry.runId}`)}
                    >
                      <div className="font-medium text-sm truncate">{entry.fileName}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(entry.startedAt).toLocaleString()}
                      </div>
                      <div className="flex gap-1 mt-2">
                        {entry.methods.map((m) => (
                          <Badge
                            key={m.method}
                            variant={m.status === 'indexing_completed' ? 'success' : 'destructive'}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {m.status === 'indexing_completed' ? (
                              <CheckCircle2 className="h-2 w-2 mr-0.5" />
                            ) : (
                              <XCircle className="h-2 w-2 mr-0.5" />
                            )}
                            {m.label.charAt(0)}
                          </Badge>
                        ))}
                        {entry.hasAiComparison && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            <Sparkles className="h-2 w-2" />
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

