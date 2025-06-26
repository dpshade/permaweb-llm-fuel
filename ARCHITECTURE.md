# Simplified Vercel Architecture

## Overview
Simple daily crawl → Vercel JSON hosting → static frontend loading

## Architecture Flow
```
GitHub Action (daily 2AM UTC)
    ↓
Crawl docs sites (Node.js)
    ↓
Generate JSON → public/docs-index.json
    ↓
Deploy to Vercel: your-json-project.vercel.app/docs-index.json
    ↓
Frontend loads from Vercel (fallback to local crawl)
```

## Key Components

### 1. **Single Unified Crawler** (`src/utils/crawler.js`)
- Works in both browser and Node.js environments
- Auto-detects environment and uses appropriate APIs
- Browser: `DOMParser` | Node.js: `JSDOM`

### 2. **Simple GitHub Action** (`.github/workflows/daily-crawl-deploy.yml`)
- Daily scheduled crawl at 2AM UTC
- Single job: crawl → verify → deploy JSON to Vercel
- Uses `amondnet/vercel-action` for deployment
- ArNS deployment commented out for now

### 3. **Frontend Loading** (`src/pages/index.astro`)
- Primary: Load from Vercel JSON endpoint
- Fallback: Local dynamic crawling if Vercel fails
- No complex mode switching

### 4. **Clean File Structure**
```
src/utils/
├── crawler.js         # Unified crawler (browser + Node.js)
├── defuddle-fetch.js   # Content extraction helpers
└── theme.js           # Theme utilities
```

## Scripts
- `bun run crawl` - Run crawler (generates `public/docs-index.json`)
- `bun run build:vercel` - Build for Vercel deployment
- `bun run dev` - Development server

## Data Flow
1. **Daily**: GitHub Action crawls → Vercel JSON hosting
2. **User visits**: Frontend loads from Vercel 
3. **Fallback**: If Vercel fails, crawl live (graceful degradation)

## Setup Required
1. Create a new Vercel project for JSON hosting
2. Set GitHub secrets:
   - `VERCEL_TOKEN` - Your Vercel token
   - `VERCEL_ORG_ID` - Your Vercel org ID  
   - `VERCEL_JSON_PROJECT_ID` - The JSON project ID
3. Update frontend URL to your Vercel JSON project URL

## Benefits
- **Simple**: Single crawler, one workflow, clear data flow
- **Fast**: Pre-crawled data loads instantly from ArNS
- **Reliable**: Graceful fallback to live crawling
- **Clean**: Minimal file structure, no duplication 