import { Client } from '@botpress/client'

let clientInstance: Client | null = null

export function getBotpressClient(): Client {
  if (!clientInstance) {
    const token = process.env.BOTPRESS_TOKEN
    const botId = process.env.BOTPRESS_BOT_ID

    if (!token || !botId) {
      throw new Error('Missing BOTPRESS_TOKEN or BOTPRESS_BOT_ID environment variables')
    }

    clientInstance = new Client({
      token,
      botId,
      apiUrl: process.env.BOTPRESS_API_URL,
    })
  }

  return clientInstance
}

export function hasCredentials(): { hasBotId: boolean; hasToken: boolean } {
  return {
    hasBotId: !!process.env.BOTPRESS_BOT_ID,
    hasToken: !!process.env.BOTPRESS_TOKEN,
  }
}

