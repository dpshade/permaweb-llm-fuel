# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Primary Package Manager**: Bun (v1.0+) is required for this project. Node.js (v18+) for fallback compatibility.

### Essential Commands
```bash
# Development
bun run dev              # Start development server at localhost:4321
bun run build            # Production build with incremental crawl
bun run build:vercel     # Vercel-specific build
bun run test             # Run tests once  
bun run test:watch       # Run tests in watch mode
bun run lint             # Run Astro linter (astro check)
bun run validate         # Run tests + lint + build (comprehensive validation)

# Documentation Crawling
bun run crawl:incremental    # Update docs index incrementally
bun run crawl:force          # Force reindex all documentation sites
bun run generate:llms        # Generate LLMs.txt files for all sites

# Deployment
bun run deploy           # Interactive deployment menu
bun run clean            # Clean build artifacts and cache
```

### Useful Development Flags
```bash
# Testing with additional options
bun run test --ui        # Interactive test UI
bun run test --coverage  # Test coverage report

# Crawling with debug output
DEBUG_CRAWL=1 bun run crawl:incremental
```

## Architecture Overview

This is an **Astro static site** that crawls Permaweb documentation sites and generates AI training data in llms.txt format.

### Core Architecture Patterns

**Client/Server Separation**: Strict separation between client and server utilities:
- `src/client/`: Browser-compatible code only (no Node.js APIs)
- `src/server/`: Server-only code with Node.js dependencies (fs, jsdom, etc.)
- Import aliases: `@client`, `@server`, `@client/utils`, `@server/utils`

**Documentation Processing Pipeline**:
1. **Crawler** (`src/server/utils/crawler.js`): Multi-site web crawler with rate limiting
2. **Content Enhancement** (`src/server/utils/content-enhancer.js`): Cleans and structures content
3. **Quality Scoring** (`src/server/utils/quality-scorer.js`): Filters low-quality content
4. **LLMs.txt Generation** (`scripts/generate-llms-txt.js`): Produces AI training files

**Configuration-Driven Crawling**: All site configurations in `public/crawl-config.json`:
- Site-specific selectors for title/content extraction
- Depth limits, page limits, and exclusion patterns
- Seed URLs for crawl starting points

### Key Components

**Data Flow**:
- Crawled data → `public/docs-index.json` (accessible at `/docs-index.json`)
- Frontend loads index via fetch for dynamic rendering
- Separate site-specific llms.txt files generated in `public/`

**UI Customization**: Query parameter system for embedding/theming:
- `?iframe=true` - Iframe-optimized layout
- `?minimal=true` - Hide header for compact view
- `?theme=dark|light` - Force theme
- `?accent=%23ff6600` - Custom accent colors (URL-encoded hex)

### Build System

**Astro Configuration** (`astro.config.mjs`):
- Static output with conditional Vercel directory structure
- Path aliases for clean imports
- Iframe compatibility headers
- Inline stylesheets for performance

**Testing Setup** (`vitest.config.js`):
- jsdom environment for DOM testing
- Global test utilities
- Coverage reporting with v8 provider

### Documentation Sites

Currently crawls 5 Permaweb ecosystem sites:
- **Hyperbeam**: `https://hyperbeam.arweave.net`
- **AO Cookbook**: `https://cookbook_ao.arweave.net`
- **AR-IO Network**: `https://docs.ar.io`
- **Arweave Cookbook**: `https://cookbook.arweave.net`
- **Permaweb Glossary**: `https://glossary.arweave.net`

Each site has specific crawl configuration in `public/crawl-config.json` with content selectors, exclusion patterns, and quality filters.

## Important Development Notes

**Server-Only Code**: Never import server utilities in client code - they contain Node.js-specific imports that will break browser builds.

**Crawl Data Management**: The `public/docs-index.json` file is git-tracked and should be updated via crawl commands, not manual editing.

**Quality Thresholds**: Content is filtered by quality scores (default threshold 0.2) and minimum word count (30 words) to ensure high-quality training data.

**Rate Limiting**: Crawler implements delays between requests to be respectful to documentation sites.

## Validation Before Commits

Always run the full validation suite before committing:
```bash
bun run validate
```

This ensures tests pass, linting is clean, and the build succeeds with current crawl data.