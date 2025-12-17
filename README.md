# Files Parsing Benchmark

A side-by-side comparison tool for benchmarking the three parsing options available in the [Botpress Files API](https://www.botpress.com/docs/api-reference/introduction#files-api): **Basic**, **Vision**, and **Landing AI**.

![Screenshot](https://img.shields.io/badge/Built_with-Bun-f9f1e1?logo=bun)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)

## Features

- **Upload & Benchmark**: Upload any document (PDF, DOCX, etc.) and parse it using all three methods in parallel
- **Progressive Results**: See results for each parsing method as soon as it completes (no waiting for all three)
- **Side-by-Side Comparison**: View parsed passages from each method in a 3-column layout
- **Parallel Search**: Semantic search across all three parsed files simultaneously, comparing results side-by-side
- **Markdown Rendering**: Tables are rendered with proper markdown formatting via remark-gfm
- **Performance Metrics**: Track processing time, passage count, and status for each method
- **History**: Local browser persistence of benchmark runs
- **Linear-inspired UI**: Clean, minimal design using shadcn/ui components

## Parsing Methods

| Method | Description | Requirements |
|--------|-------------|--------------|
| **Basic** | Default text extraction | None |
| **Vision** | LLM page transcription (`vision.transcribePages: true`) | Paid plan |
| **Landing AI** | Agentic parsing (`parsing.mode: 'agent'`) | Paid plan + feature flag |

## Prerequisites

- [Bun](https://bun.sh) v1.2.0 or later
- A Botpress bot with a valid token
- For Vision and Landing AI: A paid Botpress plan

## Setup

1. **Clone and install dependencies**

```bash
git clone <repo-url>
cd parser-compare
bun install
```

2. **Configure environment variables**

Create a `.env` file in the project root:

```bash
BOTPRESS_TOKEN=your_bot_token_here
BOTPRESS_BOT_ID=your_bot_id_here
```

You can get these from your [Botpress Cloud dashboard](https://app.botpress.cloud).

3. **Start the development server**

```bash
bun dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

## Usage

1. **Upload a document** - Drag & drop or click to select a PDF, DOCX, or other supported file
2. **Watch progress** - All three parsing methods start in parallel, each showing its own status
3. **Compare results** - View passages side-by-side as each method completes

## Architecture

The app uses a **proxy model** where the frontend initiates each parsing method independently and polls for status updates. This allows results to be displayed progressively as each method completes.

```
┌─────────────────────────────────────────────────────────────┐
│                      React Frontend                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  HomePage   │  │ RunDetailPage│  │  shadcn/ui + TW4  │  │
│  │  (upload)   │  │  (polling)   │  │                   │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP
┌──────────────────────────▼──────────────────────────────────┐
│                    Bun.serve Backend                        │
│  ┌─────────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ /methods/:m/start│ │ /files/:id/  │  │ /files/:id/   │  │
│  │  (initiate)     │  │   status     │  │   passages    │  │
│  └────────┬────────┘  └──────┬───────┘  └───────┬───────┘  │
└───────────┼──────────────────┼──────────────────┼───────────┘
            │                  │                  │
┌───────────▼──────────────────▼──────────────────▼───────────┐
│                   @botpress/client                          │
│         upsertFile · getFile · listFilePassages             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    Botpress Cloud
```

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/botpress/health` | GET | Check if credentials are configured |
| `/api/botpress/methods/:method/start` | POST | Start a single parsing method |
| `/api/botpress/files/:id/status` | GET | Poll file status (for progressive updates) |
| `/api/botpress/files/:id/passages` | GET | Fetch passages for a completed file |
| `/api/botpress/search` | GET | Parallel semantic search across all three methods |

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) - Fast JavaScript runtime with native TypeScript support
- **Frontend**: [React 19](https://react.dev) with [Tailwind CSS 4](https://tailwindcss.com)
- **Components**: [shadcn/ui](https://ui.shadcn.com) (New York style)
- **Icons**: [Lucide React](https://lucide.dev)
- **Markdown**: [react-markdown](https://github.com/remarkjs/react-markdown) with remark-gfm
- **Botpress SDK**: [@botpress/client](https://www.npmjs.com/package/@botpress/client)

## Scripts

```bash
bun dev      # Start development server with hot reload
bun start    # Start production server
bun build    # Build for production
```

## Deployment

The app is deployed on [Render](https://render.com) with native Bun support.

**Environment variables required:**
- `BOTPRESS_TOKEN`
- `BOTPRESS_BOT_ID`

Build command: `bun install`
Start command: `bun start`

## Project Structure

```
src/
├── index.tsx          # Bun server entry point with API routes
├── App.tsx            # React app shell with routing
├── frontend.tsx       # React hydration entry
├── pages/
│   ├── HomePage.tsx   # Upload + history
│   └── RunDetailPage.tsx  # Results comparison with polling
├── components/ui/     # shadcn/ui components
├── lib/
│   ├── router.ts      # Client-side routing
│   ├── history.ts     # localStorage persistence
│   └── utils.ts       # Tailwind utilities
└── server/
    ├── benchmark.ts   # Benchmark logic (startMethod, getFileStatus)
    ├── botpressClient.ts  # Client singleton
    └── types.ts       # Shared TypeScript types
```

## License

MIT
