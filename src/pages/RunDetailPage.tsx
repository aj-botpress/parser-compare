import { useState, useEffect, useRef, useCallback } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  FileText,
  Copy,
  Check,
  Search,
  Tag,
} from 'lucide-react'
import { useNavigate } from '@/lib/router'
import { getRunById, updateMethodInHistory, type HistoryEntry } from '@/lib/history'
import type { MethodResult, Passage, FileStatusResponse, SearchPassage } from '../server/types'

const POLL_INTERVAL_MS = 2000
const MAX_POLL_TIME_MS = 5 * 60 * 1000 // 5 minutes

interface RunDetailPageProps {
  runId: string
  onHistoryChange: () => void
}

export function RunDetailPage({ runId, onHistoryChange }: RunDetailPageProps) {
  const navigate = useNavigate()

  // Run data
  const [run, setRun] = useState<HistoryEntry | null>(null)
  const [loading, setLoading] = useState(true)

  // Method-specific state
  const [methodStatuses, setMethodStatuses] = useState<Record<string, string>>({})
  const [passages, setPassages] = useState<Record<string, Passage[]>>({})

  // Copy state
  const [copiedMethod, setCopiedMethod] = useState<string | null>(null)

  // Display options
  const [showMetadata, setShowMetadata] = useState(true)

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<Record<string, SearchPassage[]>>({})
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [lastQuery, setLastQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Polling refs
  const pollTimersRef = useRef<Record<string, NodeJS.Timeout>>({})
  const pollStartTimesRef = useRef<Record<string, number>>({})

  // Load run from history
  useEffect(() => {
    const entry = getRunById(runId)
    setRun(entry)
    setLoading(false)

    // Initialize method statuses from history
    if (entry) {
      const statuses: Record<string, string> = {}
      for (const m of entry.methods) {
        statuses[m.method] = m.status
      }
      setMethodStatuses(statuses)
    }
  }, [runId])

  // Fetch passages for a completed method
  const fetchPassagesForMethod = useCallback(async (fileId: string, methodName: string) => {
    try {
      const res = await fetch(`/api/botpress/files/${fileId}/passages?limit=200`)
      if (res.ok) {
        const data = await res.json()
        setPassages((prev) => ({ ...prev, [methodName]: data.passages || [] }))
      }
    } catch (e) {
      console.error(`Failed to load passages for ${methodName}:`, e)
    }
  }, [])

  // Poll a single method's status
  const pollMethodStatus = useCallback(
    async (method: MethodResult & { startedAt?: string }) => {
      const methodName = method.method
      const fileId = method.fileId
      const startedAt = (method as any).startedAt

      if (!fileId) return

      // Check for timeout
      const pollStart = pollStartTimesRef.current[methodName] || Date.now()
      if (Date.now() - pollStart > MAX_POLL_TIME_MS) {
        // Mark as timeout
        setMethodStatuses((prev) => ({ ...prev, [methodName]: 'timeout' }))
        updateMethodInHistory(runId, methodName, {
          status: 'timeout',
          failedReason: 'Indexing timed out after 5 minutes',
        })
        onHistoryChange()
        return
      }

      try {
        const url = startedAt
          ? `/api/botpress/files/${fileId}/status?startedAt=${encodeURIComponent(startedAt)}`
          : `/api/botpress/files/${fileId}/status`

        const res = await fetch(url)
        if (!res.ok) {
          console.error(`Failed to poll status for ${methodName}`)
          return
        }

        const status: FileStatusResponse = await res.json()

        // Update local state
        setMethodStatuses((prev) => ({ ...prev, [methodName]: status.status }))

        // If still processing, schedule next poll
        if (status.status === 'upload_pending' || status.status === 'indexing_pending') {
          pollTimersRef.current[methodName] = setTimeout(() => {
            pollMethodStatus(method)
          }, POLL_INTERVAL_MS)
          return
        }

        // Method finished - update history
        updateMethodInHistory(runId, methodName, {
          status: status.status,
          failedReason: status.failedReason,
          passageCount: status.passageCount,
          contentCharsTotal: status.contentCharsTotal,
          processingTimeMs: status.processingTimeMs,
          metaBreakdown: status.metaBreakdown,
        })

        // Refresh run data from history
        const updatedRun = getRunById(runId)
        if (updatedRun) {
          setRun(updatedRun)
        }

        onHistoryChange()

        // If completed, fetch passages
        if (status.status === 'indexing_completed') {
          fetchPassagesForMethod(fileId, methodName)
        }
      } catch (e) {
        console.error(`Error polling ${methodName}:`, e)
      }
    },
    [runId, onHistoryChange, fetchPassagesForMethod]
  )

  // Start polling for pending methods
  useEffect(() => {
    if (!run) return

    for (const method of run.methods) {
      const status = method.status
      const isPending = status === 'upload_pending' || status === 'indexing_pending'

      if (isPending && method.fileId) {
        // Initialize poll start time
        if (!pollStartTimesRef.current[method.method]) {
          pollStartTimesRef.current[method.method] = Date.now()
        }

        // Start polling if not already polling
        if (!pollTimersRef.current[method.method]) {
          pollMethodStatus(method)
        }
      } else if (status === 'indexing_completed' && method.fileId && !passages[method.method]) {
        // Load passages for already-completed methods
        fetchPassagesForMethod(method.fileId, method.method)
      }
    }

    // Cleanup on unmount
    return () => {
      for (const key of Object.keys(pollTimersRef.current)) {
        clearTimeout(pollTimersRef.current[key])
        delete pollTimersRef.current[key]  // Clear ref so polling can restart
      }
    }
  }, [run, passages, pollMethodStatus, fetchPassagesForMethod])

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

  // Format time
  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  // Execute search
  const executeSearch = async () => {
    const query = searchInputRef.current?.value?.trim()
    if (!query || !runId) return

    setIsSearching(true)
    setHasSearched(true)
    setLastQuery(query)

    try {
      const res = await fetch(
        `/api/botpress/search?q=${encodeURIComponent(query)}&runId=${encodeURIComponent(runId)}&limit=10`
      )

      if (!res.ok) {
        console.error('Search failed')
        return
      }

      const data = await res.json()

      // Convert results array to record by method
      const resultsByMethod: Record<string, SearchPassage[]> = {}
      for (const r of data.results) {
        resultsByMethod[r.method] = r.passages || []
      }
      setSearchResults(resultsByMethod)
    } catch (e) {
      console.error('Search error:', e)
    } finally {
      setIsSearching(false)
    }
  }

  // Close search and reset
  const closeSearch = () => {
    setSearchOpen(false)
    setSearchResults({})
    setHasSearched(false)
    setLastQuery('')
    if (searchInputRef.current) {
      searchInputRef.current.value = ''
    }
  }

  // Method labels for display
  const methodLabels: Record<string, string> = {
    'no-vision': 'Standard',
    vision: 'Vision (Gemini 3)',
    'landing-ai': 'ADE (Agentic)',
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

  const methods = ['no-vision', 'vision', 'landing-ai']

  return (
    <div className="space-y-3">
      {/* Header with back button and search */}
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
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 w-8 p-0 ${showMetadata ? '' : 'opacity-50'}`}
            onClick={() => setShowMetadata(!showMetadata)}
            title={showMetadata ? 'Hide metadata labels' : 'Show metadata labels'}
          >
            <Tag className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Search Modal */}
      <Dialog open={searchOpen} onOpenChange={(open) => !open && closeSearch()}>
        <DialogContent className="max-w-5xl h-[80vh] flex flex-col p-0 gap-0">
          {/* Search Input */}
          <div className="px-4 py-3 border-b">
            <div className="flex items-center gap-3">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                ref={searchInputRef}
                autoFocus
                placeholder="Search passages..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') executeSearch()
                }}
                className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
            </div>
            {!hasSearched && (
              <p className="text-xs text-muted-foreground mt-2 ml-7">
                Press Enter to search
              </p>
            )}
          </div>

          {/* Results Grid */}
          {hasSearched && (
            <div className="flex-1 min-h-0">
              <div className="grid grid-cols-3 h-full divide-x">
                {(['no-vision', 'vision', 'landing-ai'] as const).map((method) => (
                  <div key={method} className="flex flex-col h-full min-h-0">
                    {/* Column Header */}
                    <div className="px-4 py-2 border-b bg-muted/30 shrink-0">
                      <span className="font-medium text-sm">{methodLabels[method]}</span>
                      {searchResults[method] && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {searchResults[method].length} results
                        </span>
                      )}
                    </div>
                    {/* Results */}
                    <ScrollArea className="flex-1 min-h-0">
                      <div className="p-4 space-y-4">
                        {isSearching ? (
                          <div className="flex flex-col items-center justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            <span className="text-sm text-muted-foreground mt-2">Searching...</span>
                          </div>
                        ) : searchResults[method]?.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            No matches for "{lastQuery}"
                          </p>
                        ) : (
                          searchResults[method]?.map((result, i) => (
                            <div key={i} className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-medium text-primary">
                                  {Math.round(result.score * 100)}%
                                </span>
                                {showMetadata && result.meta.pageNumber !== undefined && (
                                  <span className="text-xs text-muted-foreground">
                                    p.{result.meta.pageNumber}
                                  </span>
                                )}
                                {showMetadata && result.meta.subtype && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    {result.meta.subtype}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm leading-relaxed line-clamp-4">
                                {result.content}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {methods.map((methodKey) => {
          const methodResult = run.methods.find((m) => m.method === methodKey)
          const methodPassages = passages[methodKey] || []
          // Use live status from polling, fallback to stored status
          const currentStatus = methodStatuses[methodKey] || methodResult?.status
          const isComplete = currentStatus === 'indexing_completed'
          const isProcessing = currentStatus === 'upload_pending' || currentStatus === 'indexing_pending'
          const isFailed = currentStatus === 'indexing_failed' || currentStatus === 'upload_failed'
          const isTimeout = currentStatus === 'timeout'

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
                      {isProcessing ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />
                          {currentStatus === 'upload_pending' ? 'Uploading' : 'Indexing'}
                        </Badge>
                      ) : isComplete ? (
                        <Badge variant="success" className="text-[10px] px-1.5 py-0">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                          Done
                        </Badge>
                      ) : isTimeout ? (
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
                      {isComplete && (
                        <>
                          <Separator orientation="vertical" className="h-3" />
                          <span>{formatTime(methodResult.processingTimeMs)}</span>
                          <Separator orientation="vertical" className="h-3" />
                          <span>{methodResult.passageCount} passages</span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </CardHeader>

              {/* Passages content */}
              <CardContent className="flex-1 p-0">
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <div className="p-4 space-y-4">
                    {isProcessing ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">
                          {currentStatus === 'upload_pending' ? 'Uploading file...' : 'Indexing document...'}
                        </p>
                      </div>
                    ) : isFailed || isTimeout ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-2">
                        <XCircle className="h-8 w-8 text-destructive" />
                        <p className="text-sm text-muted-foreground text-center">
                          {methodResult?.failedReason || (isTimeout ? 'Timed out after 5 minutes' : 'Method failed')}
                        </p>
                      </div>
                    ) : !isComplete ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : methodPassages.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-12">
                        No passages found
                      </p>
                    ) : (
                      methodPassages.map((p, i) => (
                        <div key={p.id} className="space-y-1">
                          {/* Passage label */}
                          {showMetadata && (
                            <div className="text-xs text-primary font-medium">
                              {i + 1}
                              {p.meta.subtype && ` - ${capitalize(p.meta.subtype)}`}
                              {p.meta.pageNumber !== undefined && (
                                <span className="text-muted-foreground ml-2">
                                  Page {p.meta.pageNumber}
                                </span>
                              )}
                            </div>
                          )}
                          {/* Passage content with markdown for tables */}
                          <div className="prose prose-sm max-w-none leading-relaxed">
                            <Markdown remarkPlugins={[remarkGfm]}>{p.content}</Markdown>
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
    </div>
  )
}

// Helper to capitalize first letter
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
