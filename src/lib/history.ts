import type { BenchmarkRunResult, AiComparisonResult, MethodResult, MethodJobStatus } from '../server/types'

const STORAGE_KEY = 'parser-benchmark-history'
const MAX_HISTORY_ITEMS = 25

// Store the full BenchmarkRunResult plus optional aiComparison
export interface HistoryEntry extends BenchmarkRunResult {
  aiComparison?: AiComparisonResult
}

export function getHistory(): HistoryEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored) as HistoryEntry[]
  } catch {
    return []
  }
}

export function getRunById(runId: string): HistoryEntry | null {
  const history = getHistory()
  return history.find((h) => h.runId === runId) || null
}

export function addToHistory(result: BenchmarkRunResult): void {
  try {
    const history = getHistory()

    // Create entry with full result data
    const entry: HistoryEntry = { ...result }

    // Add to beginning, remove duplicates by runId
    const filtered = history.filter((h) => h.runId !== entry.runId)
    const updated = [entry, ...filtered].slice(0, MAX_HISTORY_ITEMS)

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (e) {
    console.error('Failed to save history:', e)
  }
}

export function updateHistoryWithAiComparison(
  runId: string,
  aiComparison: AiComparisonResult
): void {
  try {
    const history = getHistory()
    const index = history.findIndex((h) => h.runId === runId)

    if (index >= 0) {
      history[index].aiComparison = aiComparison
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    }
  } catch (e) {
    console.error('Failed to update history with AI comparison:', e)
  }
}

// ============================================================
// Proxy model support - for progressive updates
// ============================================================

export interface PendingMethod {
  method: string
  label: string
  fileId: string
  status: MethodJobStatus
  startedAt: string
}

export interface PendingHistoryEntry {
  runId: string
  startedAt: string
  originalFile: {
    name: string
    size: number
    contentType: string
  }
  methods: PendingMethod[]
}

export function createPendingEntry(entry: PendingHistoryEntry): void {
  try {
    const history = getHistory()

    // Convert pending methods to partial MethodResult format
    const historyEntry: HistoryEntry = {
      runId: entry.runId,
      startedAt: entry.startedAt,
      completedAt: '', // Will be set when all complete
      originalFile: entry.originalFile,
      methods: entry.methods.map((m) => ({
        method: m.method,
        label: m.label,
        fileId: m.fileId,
        status: m.status as any, // Allow pending statuses
        processingTimeMs: 0,
        passageCount: 0,
        contentCharsTotal: 0,
        metaBreakdown: { byType: {}, bySubtype: {}, pageCount: 0 },
        sampleText: '',
        startedAt: m.startedAt, // Extra field for timing
      })) as any,
    }

    // Add to beginning, remove duplicates by runId
    const filtered = history.filter((h) => h.runId !== entry.runId)
    const updated = [historyEntry, ...filtered].slice(0, MAX_HISTORY_ITEMS)

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (e) {
    console.error('Failed to create pending entry:', e)
  }
}

export function updateMethodInHistory(
  runId: string,
  methodName: string,
  update: Partial<MethodResult> & { status: string }
): void {
  try {
    const history = getHistory()
    const index = history.findIndex((h) => h.runId === runId)

    if (index >= 0) {
      const methodIndex = history[index].methods.findIndex((m) => m.method === methodName)
      if (methodIndex >= 0) {
        // Merge the update into the existing method
        history[index].methods[methodIndex] = {
          ...history[index].methods[methodIndex],
          ...update,
        }

        // Check if all methods are complete
        const allComplete = history[index].methods.every(
          (m) =>
            m.status === 'indexing_completed' ||
            m.status === 'indexing_failed' ||
            m.status === 'upload_failed' ||
            m.status === 'timeout'
        )

        if (allComplete && !history[index].completedAt) {
          history[index].completedAt = new Date().toISOString()
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
      }
    }
  } catch (e) {
    console.error('Failed to update method in history:', e)
  }
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function exportHistory(): string {
  const history = getHistory()
  return JSON.stringify(history, null, 2)
}

export function importHistory(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as HistoryEntry[]

    if (!Array.isArray(parsed)) {
      throw new Error('Invalid history format')
    }

    // Validate structure
    for (const entry of parsed) {
      if (!entry.runId || !entry.originalFile || !Array.isArray(entry.methods)) {
        throw new Error('Invalid history entry format')
      }
    }

    // Merge with existing history
    const existing = getHistory()
    const existingIds = new Set(existing.map((h) => h.runId))
    const newEntries = parsed.filter((h) => !existingIds.has(h.runId))
    const merged = [...newEntries, ...existing].slice(0, MAX_HISTORY_ITEMS)

    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
    return true
  } catch (e) {
    console.error('Failed to import history:', e)
    return false
  }
}

// Helper to get summary for history list display
export interface HistorySummary {
  runId: string
  fileName: string
  fileSize: number
  startedAt: string
  methods: Array<{
    method: string
    label: string
    status: string
  }>
  hasAiComparison: boolean
}

export function getHistorySummaries(): HistorySummary[] {
  const history = getHistory()
  return history.map((h) => ({
    runId: h.runId,
    fileName: h.originalFile.name,
    fileSize: h.originalFile.size,
    startedAt: h.startedAt,
    methods: h.methods.map((m) => ({
      method: m.method,
      label: m.label,
      status: m.status,
    })),
    hasAiComparison: !!h.aiComparison,
  }))
}
