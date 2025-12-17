import { Zai } from '@botpress/zai'
import { z } from '@bpinternal/zui'
import { getBotpressClient } from './botpressClient'
import { getFilePassages } from './benchmark'
import type { AiComparisonResult } from './types'

const EXCERPT_CHAR_LIMIT = 4000 // Per method

async function getExcerpt(fileId: string): Promise<string> {
  try {
    const { passages } = await getFilePassages(fileId, 50)

    let excerpt = ''
    for (const p of passages) {
      if (excerpt.length + p.content.length > EXCERPT_CHAR_LIMIT) {
        break
      }
      excerpt += p.content + '\n\n'
    }

    return excerpt.trim() || '[No content extracted]'
  } catch {
    return '[Failed to fetch content]'
  }
}

export async function runAiComparison(
  runId: string,
  fileIds: { basic: string; vision: string; landingAi: string },
  instructions?: string
): Promise<AiComparisonResult> {
  const client = getBotpressClient()
  const zai = new Zai({ client })

  // Get excerpts for each method
  const [basicExcerpt, visionExcerpt, landingAiExcerpt] = await Promise.all([
    getExcerpt(fileIds.basic),
    getExcerpt(fileIds.vision),
    getExcerpt(fileIds.landingAi),
  ])

  const prompt = `Compare these three document parsing results and rank them by quality.

${instructions ? `User instructions: ${instructions}\n\n` : ''}
=== BASIC PARSING ===
${basicExcerpt}

=== VISION PARSING ===
${visionExcerpt}

=== LANDING AI (AGENT) PARSING ===
${landingAiExcerpt}

Evaluate each based on:
1. Content completeness - does it capture all important information?
2. Structure preservation - are headings, lists, tables preserved?
3. Readability - is the text clean and well-formatted?
4. Accuracy - does the extracted text seem accurate to the original?

Rank them from best (1) to worst (3).`

  // Use Zai extract to get structured comparison
  const comparison = await zai.extract(
    prompt,
    z.object({
      ranking: z.array(
        z.object({
          method: z.enum(['basic', 'vision', 'landing-ai']),
          rank: z.number().min(1).max(3),
          score: z.number().min(1).max(10).optional(),
        })
      ),
      summary: z.string().describe('A brief 2-3 sentence summary of the comparison'),
      basicNotes: z.string().describe('Strengths and weaknesses of basic parsing'),
      visionNotes: z.string().describe('Strengths and weaknesses of vision parsing'),
      landingAiNotes: z.string().describe('Strengths and weaknesses of Landing AI parsing'),
      recommendedMethod: z.enum(['basic', 'vision', 'landing-ai']),
    })
  )

  return {
    runId,
    generatedAt: new Date().toISOString(),
    ranking: comparison.ranking.sort((a, b) => a.rank - b.rank),
    summary: comparison.summary,
    perMethodNotes: {
      basic: comparison.basicNotes,
      vision: comparison.visionNotes,
      'landing-ai': comparison.landingAiNotes,
    },
    recommendedMethod: comparison.recommendedMethod,
  }
}

