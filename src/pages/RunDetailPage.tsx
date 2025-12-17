import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
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
  Columns3,
  Sparkles,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  FileText,
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

  // Side-by-side view state
  const [showSideBySide, setShowSideBySide] = useState(false)
  const [sideBySidePassages, setSideBySidePassages] = useState<Record<string, Passage[]>>({})
  const [loadingSideBySide, setLoadingSideBySide] = useState(false)

  // Sheet state (method details)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState<MethodResult | null>(null)
  const [methodPassages, setMethodPassages] = useState<Passage[]>([])
  const [loadingPassages, setLoadingPassages] = useState(false)

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

  // Load passages for a method (sheet view)
  const loadMethodPassages = async (fileId: string) => {
    setLoadingPassages(true)
    try {
      const res = await fetch(`/api/botpress/files/${fileId}/passages?limit=200`)
      if (!res.ok) throw new Error('Failed to load passages')
      const data = await res.json()
      setMethodPassages(data.passages || [])
    } catch (e) {
      console.error('Failed to load passages:', e)
      setMethodPassages([])
    } finally {
      setLoadingPassages(false)
    }
  }

  // Open method details sheet
  const openMethodSheet = (method: MethodResult) => {
    setSelectedMethod(method)
    setMethodPassages([])
    setSheetOpen(true)
    if (method.fileId && method.status === 'indexing_completed') {
      loadMethodPassages(method.fileId)
    }
  }

  // Load side-by-side passages
  const loadSideBySidePassages = async () => {
    if (!run) return

    setLoadingSideBySide(true)
    const passages: Record<string, Passage[]> = {}

    try {
      for (const m of run.methods) {
        if (m.fileId && m.status === 'indexing_completed') {
          const res = await fetch(`/api/botpress/files/${m.fileId}/passages?limit=100`)
          if (res.ok) {
            const data = await res.json()
            passages[m.method] = data.passages || []
          }
        }
      }
      setSideBySidePassages(passages)
      setShowSideBySide(true)
    } catch (e) {
      console.error('Failed to load side-by-side passages:', e)
    } finally {
      setLoadingSideBySide(false)
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

  return (
    <div className="space-y-6">
      {/* Header with back button */}
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

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={loadSideBySidePassages}
            disabled={loadingSideBySide}
          >
            {loadingSideBySide ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Columns3 className="h-4 w-4 mr-2" />
            )}
            Compare Side-by-Side
          </Button>

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
            {aiComparison ? 'AI Compared' : 'AI Compare...'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Results table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-medium">Results</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Passages</TableHead>
                <TableHead>Characters</TableHead>
                <TableHead>Cost/Usage</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.methods.map((m) => (
                <TableRow key={m.method}>
                  <TableCell className="font-medium">{m.label}</TableCell>
                  <TableCell>
                    {m.status === 'indexing_completed' ? (
                      <Badge variant="success">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Complete
                      </Badge>
                    ) : m.status === 'timeout' ? (
                      <Badge variant="warning">
                        <Clock className="h-3 w-3 mr-1" />
                        Timeout
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" />
                        Failed
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{formatTime(m.processingTimeMs)}</TableCell>
                  <TableCell>{m.passageCount}</TableCell>
                  <TableCell>{m.contentCharsTotal?.toLocaleString() || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.costOrUsageRaw ? JSON.stringify(m.costOrUsageRaw) : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openMethodSheet(m as MethodResult)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* AI Comparison result */}
      {aiComparison && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              AI Comparison
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Ranking</h4>
              <div className="flex gap-2">
                {aiComparison.ranking.map((r, i) => (
                  <Badge
                    key={r.method}
                    variant={i === 0 ? 'default' : 'secondary'}
                    className="text-sm"
                  >
                    #{r.rank} {r.method}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Summary</h4>
              <p className="text-sm text-muted-foreground">{aiComparison.summary}</p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Recommended</h4>
              <Badge variant="success">{aiComparison.recommendedMethod}</Badge>
            </div>
            <div className="grid gap-3">
              {Object.entries(aiComparison.perMethodNotes).map(([method, notes]) => (
                <div key={method} className="text-sm">
                  <span className="font-medium">{method}:</span>{' '}
                  <span className="text-muted-foreground">{notes}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Side-by-side comparison */}
      {showSideBySide && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">Side-by-Side Comparison</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowSideBySide(false)}>
                Hide
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['basic', 'vision', 'landing-ai'].map((method) => {
                const methodResult = run.methods.find((m) => m.method === method)
                const passages = sideBySidePassages[method] || []

                return (
                  <Card key={method} className="bg-muted/30">
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm font-medium">
                        {methodResult?.label || method} — Indexed
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ScrollArea className="h-[400px]">
                        <div className="p-4 space-y-3">
                          {passages.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">
                              {methodResult?.status !== 'indexing_completed'
                                ? 'Method failed'
                                : 'No passages'}
                            </p>
                          ) : (
                            passages.map((p, i) => (
                              <div key={p.id}>
                                <div className="text-xs text-muted-foreground mb-1">
                                  — chunk {i + 1}
                                  {p.meta.pageNumber !== undefined &&
                                    ` (page ${p.meta.pageNumber})`}{' '}
                                  —
                                </div>
                                <pre className="text-xs whitespace-pre-wrap font-mono bg-background p-2 rounded border">
                                  {p.content}
                                </pre>
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
          </CardContent>
        </Card>
      )}

      {/* Method details sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-xl overflow-hidden flex flex-col">
          <SheetHeader>
            <SheetTitle>
              {selectedMethod?.label} — {run.originalFile.name}
            </SheetTitle>
            <SheetDescription>
              {selectedMethod?.status === 'indexing_completed'
                ? `${selectedMethod.passageCount} passages in ${formatTime(selectedMethod.processingTimeMs)}`
                : selectedMethod?.failedReason || 'Failed'}
            </SheetDescription>
          </SheetHeader>

          <Tabs defaultValue="indexed" className="flex-1 flex flex-col overflow-hidden mt-4">
            <TabsList>
              <TabsTrigger value="original">Original</TabsTrigger>
              <TabsTrigger value="indexed">Indexed</TabsTrigger>
            </TabsList>

            <TabsContent value="original" className="flex-1 overflow-hidden">
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <FileText className="h-12 w-12 mx-auto mb-2" />
                  <p>Original file preview not available from history</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="indexed" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3 pr-4">
                  {loadingPassages ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : methodPassages.length === 0 ? (
                    <p className="text-center text-muted-foreground py-12">
                      {selectedMethod?.status !== 'indexing_completed'
                        ? 'Method failed — no passages available'
                        : 'No passages found'}
                    </p>
                  ) : (
                    methodPassages.map((p, i) => (
                      <div key={p.id}>
                        <div className="text-xs text-muted-foreground mb-1">
                          — chunk {i + 1}
                          {p.meta.pageNumber !== undefined && ` (page ${p.meta.pageNumber})`}
                          {p.meta.subtype && `, ${p.meta.subtype}`} —
                        </div>
                        <pre className="text-sm whitespace-pre-wrap font-mono bg-muted p-3 rounded">
                          {p.content}
                        </pre>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

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

