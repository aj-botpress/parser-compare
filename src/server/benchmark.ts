import { getBotpressClient } from './botpressClient'
import type {
  MethodConfig,
  MethodResult,
  BenchmarkRunResult,
  Passage,
  PassageMeta,
  StartMethodResponse,
  FileStatusResponse,
  MethodJobStatus,
} from './types'

export const METHODS: MethodConfig[] = [
  {
    name: 'basic',
    label: 'Basic',
    config: {},
  },
  {
    name: 'vision',
    label: 'Vision',
    config: {
      vision: { transcribePages: true },
    },
  },
  {
    name: 'landing-ai',
    label: 'Landing AI',
    config: {
      parsing: { mode: 'agent' },
    },
  },
]

const POLL_INTERVAL_MS = 2000
const MAX_POLL_ATTEMPTS = 150 // 5 minutes max

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function beautifyText(text: string): string {
  // Simple whitespace cleanup like Dashboard's beautifyText
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function getAllPassages(
  client: ReturnType<typeof getBotpressClient>,
  fileId: string,
  limit = 200
): Promise<Passage[]> {
  const allPassages: Passage[] = []
  let nextToken: string | undefined

  do {
    const result = await client.listFilePassages({
      id: fileId,
      limit,
      nextToken,
    })

    for (const p of result.passages) {
      allPassages.push({
        id: p.id,
        content: beautifyText(p.content),
        meta: (p.meta || {}) as PassageMeta,
      })
    }

    nextToken = result.meta.nextToken
  } while (nextToken)

  return allPassages
}

async function benchmarkMethod(
  client: ReturnType<typeof getBotpressClient>,
  fileBuffer: ArrayBuffer,
  fileName: string,
  contentType: string,
  method: MethodConfig
): Promise<MethodResult> {
  const startTime = Date.now()
  const key = `benchmark-${method.name}-${Date.now()}-${fileName}`

  try {
    // 1. Create file entry with indexing config
    const { file } = await client.upsertFile({
      key,
      size: fileBuffer.byteLength,
      index: true,
      contentType,
      indexing: {
        configuration: method.config as any,
      },
    })

    // 2. Upload the actual file content
    const uploadUrl = (file as any).uploadUrl
    if (!uploadUrl) {
      throw new Error('No uploadUrl returned from upsertFile')
    }

    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: fileBuffer,
    })

    // 3. Poll for indexing completion
    let finalFile = file as any
    let attempts = 0

    while (
      (finalFile.status === 'upload_pending' || finalFile.status === 'indexing_pending') &&
      attempts < MAX_POLL_ATTEMPTS
    ) {
      await sleep(POLL_INTERVAL_MS)
      const { file: updated } = await client.getFile({ id: file.id })
      finalFile = updated as any
      attempts++
    }

    const processingTimeMs = Date.now() - startTime

    // Check for timeout
    if (attempts >= MAX_POLL_ATTEMPTS) {
      return {
        method: method.name,
        label: method.label,
        fileId: file.id,
        status: 'timeout',
        failedReason: 'Indexing timed out after 5 minutes',
        processingTimeMs,
        passageCount: 0,
        contentCharsTotal: 0,
        metaBreakdown: { byType: {}, bySubtype: {}, pageCount: 0 },
        sampleText: '',
      }
    }

    // Check for failure
    if (finalFile.status === 'indexing_failed' || finalFile.status === 'upload_failed') {
      return {
        method: method.name,
        label: method.label,
        fileId: file.id,
        status: finalFile.status,
        failedReason: finalFile.failedStatusReason || 'Unknown error',
        processingTimeMs,
        passageCount: 0,
        contentCharsTotal: 0,
        metaBreakdown: { byType: {}, bySubtype: {}, pageCount: 0 },
        sampleText: '',
      }
    }

    // 4. Get passages
    const passages = await getAllPassages(client, file.id)

    // 5. Compute metrics
    const contentCharsTotal = passages.reduce((sum, p) => sum + p.content.length, 0)

    const byType: Record<string, number> = {}
    const bySubtype: Record<string, number> = {}
    const pageNumbers = new Set<number>()

    for (const p of passages) {
      if (p.meta.type) {
        byType[p.meta.type] = (byType[p.meta.type] || 0) + 1
      }
      if (p.meta.subtype) {
        bySubtype[p.meta.subtype] = (bySubtype[p.meta.subtype] || 0) + 1
      }
      if (p.meta.pageNumber !== undefined) {
        pageNumbers.add(p.meta.pageNumber)
      }
    }

    // Sample text: first few passages concatenated
    const samplePassages = passages.slice(0, 3)
    const sampleText = samplePassages.map((p) => p.content).join('\n\n---\n\n')

    return {
      method: method.name,
      label: method.label,
      fileId: file.id,
      status: 'indexing_completed',
      processingTimeMs,
      passageCount: passages.length,
      contentCharsTotal,
      metaBreakdown: {
        byType,
        bySubtype,
        pageCount: pageNumbers.size,
      },
      sampleText: sampleText.slice(0, 2000), // Limit sample size
      costOrUsageRaw: (finalFile as any).usage || null,
    }
  } catch (error) {
    const processingTimeMs = Date.now() - startTime
    return {
      method: method.name,
      label: method.label,
      fileId: '',
      status: 'indexing_failed',
      failedReason: error instanceof Error ? error.message : String(error),
      processingTimeMs,
      passageCount: 0,
      contentCharsTotal: 0,
      metaBreakdown: { byType: {}, bySubtype: {}, pageCount: 0 },
      sampleText: '',
    }
  }
}

export async function runBenchmark(
  fileBuffer: ArrayBuffer,
  fileName: string,
  contentType: string
): Promise<BenchmarkRunResult> {
  const client = getBotpressClient()
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const startedAt = new Date().toISOString()

  const results: MethodResult[] = []

  // Run each method sequentially for cleaner benchmarking
  for (const method of METHODS) {
    console.log(`[Benchmark] Starting ${method.label}...`)
    const result = await benchmarkMethod(client, fileBuffer, fileName, contentType, method)
    results.push(result)
    console.log(`[Benchmark] ${method.label}: ${result.status} in ${result.processingTimeMs}ms`)
  }

  return {
    runId,
    startedAt,
    completedAt: new Date().toISOString(),
    originalFile: {
      name: fileName,
      size: fileBuffer.byteLength,
      contentType,
    },
    methods: results,
  }
}

export async function getFilePassages(
  fileId: string,
  limit = 200,
  nextToken?: string
): Promise<{ passages: Passage[]; nextToken?: string }> {
  const client = getBotpressClient()

  const result = await client.listFilePassages({
    id: fileId,
    limit,
    nextToken,
  })

  const passages: Passage[] = result.passages.map((p) => ({
    id: p.id,
    content: beautifyText(p.content),
    meta: (p.meta || {}) as PassageMeta,
  }))

  return {
    passages,
    nextToken: result.meta.nextToken,
  }
}

// ============================================================
// Proxy model functions - for independent method execution
// ============================================================

export function getMethodConfig(methodName: string): MethodConfig | undefined {
  return METHODS.find((m) => m.name === methodName)
}

export async function startMethod(
  fileBuffer: ArrayBuffer,
  fileName: string,
  contentType: string,
  methodName: string
): Promise<StartMethodResponse> {
  const client = getBotpressClient()
  const method = getMethodConfig(methodName)

  if (!method) {
    throw new Error(`Unknown method: ${methodName}`)
  }

  const key = `benchmark-${method.name}-${Date.now()}-${fileName}`
  const startedAt = new Date().toISOString()

  // 1. Create file entry with indexing config
  const { file } = await client.upsertFile({
    key,
    size: fileBuffer.byteLength,
    index: true,
    contentType,
    indexing: {
      configuration: method.config as any,
    },
  })

  // 2. Upload the actual file content
  const uploadUrl = (file as any).uploadUrl
  if (!uploadUrl) {
    throw new Error('No uploadUrl returned from upsertFile')
  }

  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: fileBuffer,
  })

  // Return immediately - don't wait for indexing
  return {
    fileId: file.id,
    method: method.name,
    label: method.label,
    startedAt,
  }
}

export async function getFileStatus(
  fileId: string,
  startedAt?: string
): Promise<FileStatusResponse> {
  const client = getBotpressClient()

  const { file } = await client.getFile({ id: fileId })
  const fileData = file as any

  // Map Botpress status to our status
  const status: MethodJobStatus = fileData.status

  const response: FileStatusResponse = {
    fileId,
    status,
  }

  // Add failure reason if applicable
  if (status === 'indexing_failed' || status === 'upload_failed') {
    response.failedReason = fileData.failedStatusReason || 'Unknown error'
  }

  // If completed, fetch passages and compute metrics
  if (status === 'indexing_completed') {
    const passages = await getAllPassages(client, fileId)

    const contentCharsTotal = passages.reduce((sum, p) => sum + p.content.length, 0)

    const byType: Record<string, number> = {}
    const bySubtype: Record<string, number> = {}
    const pageNumbers = new Set<number>()

    for (const p of passages) {
      if (p.meta.type) {
        byType[p.meta.type] = (byType[p.meta.type] || 0) + 1
      }
      if (p.meta.subtype) {
        bySubtype[p.meta.subtype] = (bySubtype[p.meta.subtype] || 0) + 1
      }
      if (p.meta.pageNumber !== undefined) {
        pageNumbers.add(p.meta.pageNumber)
      }
    }

    // Calculate processing time if startedAt was provided
    if (startedAt) {
      response.processingTimeMs = Date.now() - new Date(startedAt).getTime()
    }

    response.passageCount = passages.length
    response.contentCharsTotal = contentCharsTotal
    response.metaBreakdown = {
      byType,
      bySubtype,
      pageCount: pageNumbers.size,
    }
  }

  return response
}

