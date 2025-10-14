# AR.IO Selector Evaluation Results
**Date**: 2025-10-14

## Executive Summary

The selectors for docs.ar.io are **WORKING CORRECTLY**, but there's a **CRITICAL BUG** in the crawler that strips out all content before saving to the index.

## Current State (Baseline)

### Crawl Stats
- **Pages crawled**: 101
- **Pages with content**: 0 ❌
- **Average words**: 360 (misleading - calculated but not saved)
- **Crawl duration**: 143.45s
- **Pages/second**: 0.7

### Current Selectors
```json
{
  "title": "h1, title",
  "content": "article, main, .content, [role='main']"
}
```

## Live Testing Results

Tested against multiple pages including:
- `https://docs.ar.io/sdks/ar-io-sdk`
- `https://docs.ar.io/learn/what-is-arweave`

**Site Architecture**: Next.js with server-side rendering (SSR). Content IS included in initial HTML payload, not client-side rendered.

### ✅ Selectors That Work
| Selector | Content Size | Status | Notes |
|----------|-------------|---------|-------|
| `main` | 4,812 chars | ✓ **BEST** | Captures full page layout |
| `article` | 3,914 chars | ✓ **RECOMMENDED** | Captures just content area |
| `.prose` | 3,771 chars | ✓ Good | Markdown content wrapper |

### ❌ Selectors That Don't Work
- `.content` - 0 chars (class doesn't exist)
- `[role="main"]` - 0 chars (attribute not used)
- `#__next` - 0 chars (JS framework root, not content)
- `.nextra-content` - 0 chars (wrong framework - this is Next.js, not Nextra)

## The Bug

**Location**: `src/server/utils/crawler.js:858-868`

```javascript
// pageData contains: { url, title, content, estimatedWords, ... }
// BUT when pushing to pages array:
pages.push({
  url: pageData.url,
  title: pageData.title,
  estimatedWords: pageData.estimatedWords,  // ✓ Saved
  // ❌ content: pageData.content  <- MISSING!
  // ...
});
```

**Impact**: All content extraction works correctly, but content is discarded before saving to index.

## Root Cause Analysis

1. ✅ docs.ar.io uses Next.js with SSR - content IS in the HTML
2. ✅ Verified live: `<article>` and `<main>` tags exist with full content
3. ✅ Selectors `article` and `main` successfully extract 3,900+ chars of content
4. ✅ `extractPageMetadata()` function returns complete pageData with content
5. ✅ Defuddle extraction also works (fallback to manual selectors)
6. ❌ **BUG**: Content field omitted when building final pages array (line 858-868)
7. ❌ **RESULT**: docs-index.json contains titles/metadata but zero actual content

**HTML Structure Confirmed**:
```html
<main id="nd-docs-layout" class="...">
  <div id="nd-page" class="...">
    <article class="flex min-w-0 w-full flex-col gap-4...">
      <div class="prose flex-1">
        <!-- ACTUAL CONTENT HERE -->
        <h1>What is Arweave?</h1>
        <p>Arweave is a decentralized storage network...</p>
      </div>
    </article>
  </div>
</main>
```

Our selectors correctly target this structure.

## Recommendations

### Immediate Fix (Required)
Add `content` field to the pages object in crawler.js:

```javascript
pages.push({
  url: pageData.url,
  title: pageData.title,
  content: pageData.content,  // ← ADD THIS LINE
  estimatedWords: pageData.estimatedWords,
  // ...
});
```

### Selector Optimization (Optional)
Current selectors work, but could be improved:

**Current**: `"article, main, .content, [role='main']"`
**Recommended**: `"main, article, .prose"`

Rationale:
- `main` gets 4,812 chars (best coverage)
- `article` gets 3,914 chars (good fallback)
- `.prose` gets 3,771 chars (semantic content wrapper)
- Remove `.content` and `[role='main']` (never match)

## A/B Test Plan

Once bug is fixed:

1. **Baseline** (after bug fix with current selectors)
   - Re-crawl docs.ar.io
   - Document pages found and average word count

2. **Test** (with optimized selectors)
   - Update selectors to `"main, article, .prose"`
   - Re-crawl docs.ar.io
   - Compare:
     - Total pages found
     - Average words per page
     - Content quality/completeness

## Sample Low Word Count Pages

After bug fix, investigate these pages if they still have low counts:

- `/apis/turbo/payment-service/balance` - 91 words
- `/apis/turbo/payment-service/payments` - 83 words
- `/apis/ar-io-node/data` - 77 words
- `/sdks/ar-io-sdk` - 50 words
- `/build/access/arns` - 57 words

These may be legitimately short pages (API references, redirects) or may need JS execution to render fully.

## Next Steps

1. ✅ Fix crawler bug by adding content field
2. Re-crawl docs.ar.io to get actual baseline
3. Optionally update selectors to `"main, article, .prose"`
4. Compare before/after metrics
5. Investigate any remaining low word count pages
