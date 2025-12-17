import { serve } from 'bun'
import index from './index.html'
import { hasCredentials } from './server/botpressClient'
import { runBenchmark, getFilePassages, startMethod, getFileStatus, METHODS } from './server/benchmark'
import type { HealthResponse } from './server/types'

const server = serve({
  routes: {
    // Health check endpoint
    '/api/botpress/health': {
      async GET() {
        const creds = hasCredentials()
        const response: HealthResponse = {
          status: creds.hasBotId && creds.hasToken ? 'configured' : 'missing_credentials',
          hasBotId: creds.hasBotId,
          hasToken: creds.hasToken,
        }
        return Response.json(response)
      },
    },

    // Benchmark endpoint - accepts multipart form with file
    '/api/botpress/benchmark': {
      async POST(req) {
        try {
          const formData = await req.formData()
          const file = formData.get('file') as File | null

          if (!file) {
            return Response.json({ error: 'No file provided' }, { status: 400 })
          }

          const fileBuffer = await file.arrayBuffer()
          const fileName = file.name
          const contentType = file.type || 'application/octet-stream'

          console.log(`[API] Starting benchmark for ${fileName} (${fileBuffer.byteLength} bytes)`)

          const result = await runBenchmark(fileBuffer, fileName, contentType)

          console.log(`[API] Benchmark completed: ${result.runId}`)

          return Response.json(result)
        } catch (error) {
          console.error('[API] Benchmark error:', error)
          return Response.json(
            { error: error instanceof Error ? error.message : 'Benchmark failed' },
            { status: 500 }
          )
        }
      },
    },

    // Get passages for a specific file (for history drill-down)
    '/api/botpress/files/:id/passages': {
      async GET(req) {
        try {
          const fileId = req.params.id
          const url = new URL(req.url)
          const limit = parseInt(url.searchParams.get('limit') || '200', 10)
          const nextToken = url.searchParams.get('nextToken') || undefined

          const result = await getFilePassages(fileId, limit, nextToken)

          return Response.json(result)
        } catch (error) {
          console.error('[API] Get passages error:', error)
          return Response.json(
            { error: error instanceof Error ? error.message : 'Failed to get passages' },
            { status: 500 }
          )
        }
      },
    },

    // ============================================================
    // Proxy model endpoints - for independent method execution
    // ============================================================

    // Start a single parsing method
    '/api/botpress/methods/:method/start': {
      async POST(req) {
        try {
          const methodName = req.params.method
          const validMethods = METHODS.map((m) => m.name)

          if (!validMethods.includes(methodName as any)) {
            return Response.json(
              { error: `Invalid method: ${methodName}. Valid methods: ${validMethods.join(', ')}` },
              { status: 400 }
            )
          }

          const formData = await req.formData()
          const file = formData.get('file') as File | null

          if (!file) {
            return Response.json({ error: 'No file provided' }, { status: 400 })
          }

          const fileBuffer = await file.arrayBuffer()
          const fileName = file.name
          const contentType = file.type || 'application/octet-stream'

          console.log(`[API] Starting ${methodName} for ${fileName} (${fileBuffer.byteLength} bytes)`)

          const result = await startMethod(fileBuffer, fileName, contentType, methodName)

          console.log(`[API] ${methodName} started: fileId=${result.fileId}`)

          return Response.json(result)
        } catch (error) {
          console.error('[API] Start method error:', error)
          return Response.json(
            { error: error instanceof Error ? error.message : 'Failed to start method' },
            { status: 500 }
          )
        }
      },
    },

    // Get file status (for polling)
    '/api/botpress/files/:id/status': {
      async GET(req) {
        try {
          const fileId = req.params.id
          const url = new URL(req.url)
          const startedAt = url.searchParams.get('startedAt') || undefined

          const result = await getFileStatus(fileId, startedAt)

          return Response.json(result)
        } catch (error) {
          console.error('[API] Get status error:', error)
          return Response.json(
            { error: error instanceof Error ? error.message : 'Failed to get status' },
            { status: 500 }
          )
        }
      },
    },

    // Serve index.html for all unmatched routes (SPA fallback)
    '/*': index,
  },

  development: process.env.NODE_ENV !== 'production' && {
    hmr: true,
    console: true,
  },
})

console.log(`🚀 Server running at ${server.url}`)
