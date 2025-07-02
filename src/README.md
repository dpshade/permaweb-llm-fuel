# Project Structure

This project uses a strict separation between server and client code to prevent Node.js modules from being bundled in browser builds.

## Directory Structure

```
src/
├── client/           # Browser-compatible code only
│   ├── scripts/     # Client-side scripts
│   └── utils/       # Browser utilities (DOM, fetch, etc.)
├── server/          # Node.js-only code
│   └── utils/       # Server utilities (fs, jsdom, etc.)
├── pages/           # Astro pages (universal)
├── styles/          # CSS files (universal)
└── env.d.ts         # TypeScript declarations
```

## Import Rules

### Client Code (`src/client/**/*`)
- ✅ Browser APIs: `document`, `window`, `DOMParser`, `fetch`
- ✅ Client utilities: `@client/utils/*`
- ❌ Node.js modules: `fs`, `path`, `process`, `jsdom`
- ❌ Server utilities: `@server/utils/*`

### Server Code (`src/server/**/*`)
- ✅ Node.js APIs: `fs`, `path`, `process`, `jsdom`
- ✅ Server utilities: `@server/utils/*`
- ❌ Browser APIs: `document`, `window`, `DOMParser`
- ❌ Client utilities: `@client/utils/*`

### Universal Code (`src/pages/**/*`, `src/styles/**/*`)
- ✅ Astro components and styles
- ❌ Direct imports of server or client utilities

## Path Aliases

The following path aliases are configured in `astro.config.mjs`:

- `@` → `/src`
- `@client` → `/src/client`
- `@server` → `/src/server`
- `@client/utils` → `/src/client/utils`
- `@server/utils` → `/src/server/utils`

## Examples

### Correct Client Imports
```javascript
// ✅ Browser-compatible imports
import { fetchAndClean } from '@client/utils/defuddle-fetch-client.js';
import { initializeTheme } from '@client/utils/theme.js';
```

### Correct Server Imports
```javascript
// ✅ Node.js-compatible imports
import { crawlSite } from '@server/utils/crawler.js';
import { fetchAndClean } from '@server/utils/defuddle-fetch-server.js';
```

### Incorrect Imports (Will Cause Errors)
```javascript
// ❌ Server code in client
import { crawlSite } from '@server/utils/crawler.js'; // ESLint error

// ❌ Client code in server
import { initializeTheme } from '@client/utils/theme.js'; // ESLint error

// ❌ Node.js modules in client
import fs from 'fs'; // ESLint error
```

## Linting

ESLint is configured to enforce these rules:

1. **No Node.js modules in client code**: Prevents `fs`, `path`, `process`, `jsdom` imports
2. **No cross-environment imports**: Prevents `@server/*` in client and `@client/*` in server
3. **No Node.js globals in client**: Prevents `process`, `__dirname`, `__filename` usage

## Build Process

- **Development**: `bun run dev` - Uses Astro's dev server
- **Build**: `bun run build` - Runs crawler (server) then builds client
- **Crawling**: `bun run crawl:*` - Server-only operations
- **Deployment**: `bun run deploy:*` - Server-only operations

## Troubleshooting

### "Module not found" errors
- Check that you're importing from the correct environment (`@client/*` vs `@server/*`)
- Ensure the file exists in the expected location
- Verify path aliases are correctly configured

### "Node.js module not available" errors
- Move the code to `src/server/` if it uses Node.js APIs
- Use browser-compatible alternatives in `src/client/`
- Split functionality between server and client versions if needed

### Build failures
- Run `bun run lint` to check for import violations
- Ensure all imports follow the environment separation rules
- Check that server-only code isn't being bundled for the browser 