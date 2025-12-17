import { useState, useEffect } from 'react'
import Markdown from 'react-markdown'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  FileText,
  Copy,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNavigate } from '@/lib/router'
import { getRunById, updateHistoryWithAiComparison, type HistoryEntry } from '@/lib/history'
import type { MethodResult, AiComparisonResult, Passage } from '../server/types'

interface RunDetailPageProps {
  runId: string
  onHistoryChange: () => void
}

export function RunDetailPage({ runId, onHistoryChange }: RunDetailPageProps) {
  const navigate = useNavigate()

  // Run data
  const [run, setRun] = useState<HistoryEntry | null>(null)
  const [loading, setLoading] = useState(true)

  // Passages for each method
  const [passages, setPassages] = useState<Record<string, Passage[]>>({})
  const [loadingPassages, setLoadingPassages] = useState(true)

  // Copy state
  const [copiedMethod, setCopiedMethod] = useState<string | null>(null)

  // AI Compare state
  const [showAiCompareDialog, setShowAiCompareDialog] = useState(false)
  const [isRunningAiCompare, setIsRunningAiCompare] = useState(false)
  const [aiComparison, setAiComparison] = useState<AiComparisonResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load run from history
  useEffect(() => {
    const entry = getRunById(runId)
    setRun(entry)
    setAiComparison(entry?.aiComparison || null)
    setLoading(false)
  }, [runId])

  // Load passages for all methods
  useEffect(() => {
    if (!run) return

    const loadAllPassages = async () => {
      setLoadingPassages(true)
      const allPassages: Record<string, Passage[]> = {}

      for (const m of run.methods) {
        if (m.fileId && m.status === 'indexing_completed') {
          try {
            const res = await fetch(`/api/botpress/files/${m.fileId}/passages?limit=200`)
            if (res.ok) {
              const data = await res.json()
              allPassages[m.method] = data.passages || []
            }
          } catch (e) {
            console.error(`Failed to load passages for ${m.method}:`, e)
          }
        }
      }

      setPassages(allPassages)
      setLoadingPassages(false)
    }

    loadAllPassages()
  }, [run])

  // Copy all passages for a method
  const copyPassages = async (method: string) => {
    const methodPassages = passages[method] || []
    const text = methodPassages.map((p) => p.content).join('\n\n---\n\n')

    try {
      await navigator.clipboard.writeText(text)
      setCopiedMethod(method)
      setTimeout(() => setCopiedMethod(null), 2000)
    } catch (e) {
      console.error('Failed to copy:', e)
    }
  }

  // Run AI comparison
  const runAiComparison = async () => {
    if (!run) return

    const fileIds = {
      basic: run.methods.find((m) => m.method === 'basic')?.fileId || '',
      vision: run.methods.find((m) => m.method === 'vision')?.fileId || '',
      landingAi: run.methods.find((m) => m.method === 'landing-ai')?.fileId || '',
    }

    if (!fileIds.basic || !fileIds.vision || !fileIds.landingAi) {
      setError('Cannot run AI comparison: some methods failed')
      return
    }

    setIsRunningAiCompare(true)
    setShowAiCompareDialog(false)
    setError(null)

    try {
      const res = await fetch('/api/botpress/ai-compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: run.runId, fileIds }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'AI comparison failed')
      }

      const comparison: AiComparisonResult = await res.json()
      setAiComparison(comparison)

      // Update history with AI comparison
      updateHistoryWithAiComparison(run.runId, comparison)
      onHistoryChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI comparison failed')
    } finally {
      setIsRunningAiCompare(false)
    }
  }

  // Format time
  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!run) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">Run Not Found</h2>
            <p className="text-muted-foreground">
              This benchmark run doesn't exist or has been cleared from history.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const methods = ['basic', 'vision', 'landing-ai']

  return (
    <div className="space-y-3">
      {/* Header with back button and AI Compare */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h2 className="font-semibold">{run.originalFile.name}</h2>
            <p className="text-sm text-muted-foreground">
              {new Date(run.startedAt).toLocaleString()}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => setShowAiCompareDialog(true)}
          disabled={isRunningAiCompare || !!aiComparison}
        >
          {isRunningAiCompare ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {aiComparison ? 'AI Compared' : 'AI Compare'}
        </Button>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* AI Comparison result */}
      {aiComparison && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-4">
              <Sparkles className="h-5 w-5 text-primary mt-0.5" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">AI Recommendation:</span>
                  <Badge variant="default">{aiComparison.recommendedMethod}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{aiComparison.summary}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {methods.map((methodKey) => {
          const methodResult = run.methods.find((m) => m.method === methodKey)
          const methodPassages = passages[methodKey] || []
          const isComplete = methodResult?.status === 'indexing_completed'

          return (
            <Card key={methodKey} className="flex flex-col">
              {/* Column header */}
              <CardHeader className="pb-2 space-y-0">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{methodResult?.label || methodKey}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => copyPassages(methodKey)}
                    disabled={!isComplete || methodPassages.length === 0}
                  >
                    {copiedMethod === methodKey ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {methodResult && (
                    <>
                      {isComplete ? (
                        <Badge variant="success" className="text-[10px] px-1.5 py-0">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                          Done
                        </Badge>
                      ) : methodResult.status === 'timeout' ? (
                        <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                          <Clock className="h-2.5 w-2.5 mr-0.5" />
                          Timeout
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          <XCircle className="h-2.5 w-2.5 mr-0.5" />
                          Failed
                        </Badge>
                      )}
                      <Separator orientation="vertical" className="h-3" />
                      <span>{formatTime(methodResult.processingTimeMs)}</span>
                      <Separator orientation="vertical" className="h-3" />
                      <span>{methodResult.passageCount} passages</span>
                    </>
                  )}
                </div>
              </CardHeader>

              {/* Passages content */}
              <CardContent className="flex-1 p-0">
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <div className="p-4 space-y-4">
                    {loadingPassages ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : !isComplete ? (
                      <p className="text-sm text-muted-foreground text-center py-12">
                        {methodResult?.failedReason || 'Method failed'}
                      </p>
                    ) : methodPassages.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-12">
                        No passages found
                      </p>
                    ) : (
                      methodPassages.map((p, i) => (
                        <div key={p.id} className="space-y-1">
                          {/* Passage label */}
                          <div className="text-xs text-primary font-medium">
                            {i + 1}
                            {p.meta.subtype && ` - ${capitalize(p.meta.subtype)}`}
                            {p.meta.pageNumber !== undefined && (
                              <span className="text-muted-foreground ml-2">
                                Page {p.meta.pageNumber}
                              </span>
                            )}
                          </div>
                          {/* Passage content with markdown rendering */}
                          <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed">
                            <Markdown>{p.content}</Markdown>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* AI Compare confirmation dialog */}
      <Dialog open={showAiCompareDialog} onOpenChange={setShowAiCompareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run AI Comparison?</DialogTitle>
            <DialogDescription>
              This will call Zai to analyze and compare the three parsing results. This may incur
              cost depending on your Botpress plan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAiCompareDialog(false)}>
              Cancel
            </Button>
            <Button onClick={runAiComparison}>
              <Sparkles className="h-4 w-4 mr-2" />
              Run AI Compare
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Helper to capitalize first letter
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
