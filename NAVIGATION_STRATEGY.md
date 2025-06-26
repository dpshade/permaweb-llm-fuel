# Navigation-Based Crawling Strategy

## Problem Decomposition

### 1. **Seed URL Validation & Trust**
- **Problem**: Ensure seed URLs are valid and treat them as authoritative entry points
- **Solution**: Validate seed URLs for content quality, then use them as the primary navigation source
- **Current Issue**: Seed URLs are tested but then overshadowed by common pattern testing

### 2. **Navigation Structure Discovery**
- **Problem**: Extract the actual navigation hierarchy from seed pages
- **Solution**: Parse navigation elements (nav, sidebar, breadcrumbs) to understand site structure
- **Current Issue**: Navigation is extracted but not used to inform crawling strategy

### 3. **Sibling Page Discovery**
- **Problem**: Find pages at the same hierarchical level as seed pages
- **Solution**: Follow navigation links that appear alongside seed URLs in navigation menus
- **Current Issue**: Sister page discovery was vocabulary-based and generated invalid URLs

### 4. **Parent-Child Relationship Mapping**
- **Problem**: Understand which pages are parents/children of seed URLs
- **Solution**: Use breadcrumbs, URL structure, and navigation hierarchy
- **Current Issue**: No hierarchical understanding, treats all URLs equally

### 5. **Navigation Context Prioritization**
- **Problem**: Prioritize pages that appear in primary navigation vs secondary/footer links
- **Solution**: Weight pages based on their navigation context (main nav > sidebar > footer)
- **Current Issue**: All links are treated with equal priority

## Improved Strategy

### Phase 1: Seed URL Analysis
1. Validate each seed URL for content quality
2. Extract navigation structure from seed pages
3. Identify navigation containers (primary nav, sidebar, breadcrumbs)
4. Map the navigation hierarchy

### Phase 2: Sibling Discovery
1. From seed pages, extract all navigation links at the same level
2. Follow "next/previous" pagination links
3. Discover section-based siblings (e.g., if seed is in "guides", find other guides)

### Phase 3: Hierarchical Expansion
1. Move up: Find parent pages through breadcrumbs and URL structure
2. Move down: Find child pages through section navigation
3. Lateral movement: Find related sections at the same level

### Phase 4: Quality-Based Filtering
1. Prioritize pages that appear in multiple navigation contexts
2. Weight by navigation prominence (main nav > sub nav > footer)
3. Filter by content quality and relevance

## Benefits of Navigation-Based Approach

1. **Respects Site Architecture**: Uses the site's own organization
2. **Reduces False Positives**: Follows actual links rather than guessing URLs
3. **Better Coverage**: Discovers pages through their natural relationships
4. **Efficient**: No need to test arbitrary patterns
5. **Context-Aware**: Understands page importance through navigation placement 