// Shared types for benchmark responses

export interface MethodConfig {
  name: 'no-vision' | 'vision' | 'landing-ai'
  label: string
  config: Record<string, unknown>
}

export interface PassageMeta {
  type?: string
  subtype?: string
  pageNumber?: number
  position?: number
  sourceUrl?: string
}

export interface Passage {
  id: string
  content: string
  meta: PassageMeta
}

export interface MethodResult {
  method: string
  label: string
  fileId: string
  status: 'indexing_completed' | 'indexing_failed' | 'upload_failed' | 'timeout'
  failedReason?: string
  processingTimeMs: number
  passageCount: number
  contentCharsTotal: number
  metaBreakdown: {
    byType: Record<string, number>
    bySubtype: Record<string, number>
    pageCount: number
  }
  sampleText: string
  costOrUsageRaw?: unknown
}

export interface BenchmarkRunResult {
  runId: string
  startedAt: string
  completedAt: string
  originalFile: {
    name: string
    size: number
    contentType: string
  }
  methods: MethodResult[]
}

export interface AiComparisonResult {
  runId: string
  generatedAt: string
  ranking: Array<{
    method: string
    rank: number
    score?: number
  }>
  summary: string
  perMethodNotes: Record<string, string>
  recommendedMethod: string
}

export interface HealthResponse {
  status: 'configured' | 'missing_credentials'
  hasBotId: boolean
  hasToken: boolean
}

// Proxy model types

export type MethodJobStatus =
  | 'upload_pending'
  | 'indexing_pending'
  | 'indexing_completed'
  | 'indexing_failed'
  | 'upload_failed'
  | 'timeout'

export interface StartMethodResponse {
  fileId: string
  method: string
  label: string
  startedAt: string
}

export interface FileStatusResponse {
  fileId: string
  status: MethodJobStatus
  failedReason?: string
  // Only included when completed:
  passageCount?: number
  contentCharsTotal?: number
  processingTimeMs?: number
  metaBreakdown?: {
    byType: Record<string, number>
    bySubtype: Record<string, number>
    pageCount: number
  }
}

// Search types

export interface SearchPassage {
  content: string
  score: number
  meta: PassageMeta
  fileId: string
}

export interface SearchMethodResult {
  method: string
  passages: SearchPassage[]
  error?: string
}

export interface ParallelSearchResponse {
  query: string
  results: SearchMethodResult[]
}

