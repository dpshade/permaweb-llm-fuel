# Permaweb LLMs Builder

An interactive tool to select and curate Permaweb documentation into `llms.txt` format for AI training. Built with Astro and powered by [Defuddle](https://www.npmjs.com/package/defuddle) for clean content extraction.

## 🚀 Features

- **📚 Multi-Site Documentation Crawling**: Indexes AO Cookbook, Arweave Cookbook, and Hyperbeam documentation
- **🌳 Interactive Tree View**: Hierarchical display of documentation with collapsible sections
- **✅ Selective Content Curation**: Checkbox-based selection of individual pages or entire sections
- **🧹 Clean Content Extraction**: Uses Defuddle to extract main content, removing clutter and navigation
- **📄 LLMs.txt Generation**: Formats selected content into a standardized format for AI training
- **🎨 Iframe Compatible**: Fully embeddable with theme support and URL parameter customization
- **🌙 Dark/Light Theme**: Auto-detecting theme with manual toggle
- **📱 Responsive Design**: Works seamlessly on desktop and mobile devices

## 🎯 Use Cases

- **AI Training Data**: Generate curated documentation collections for language model training
- **Research**: Compile specific topics from multiple Permaweb documentation sources
- **Documentation Backup**: Create offline-readable versions of important documentation
- **Content Analysis**: Extract clean text for analysis and processing

## 🛠️ Technology Stack

- **Framework**: [Astro](https://astro.build/) - Static site generator with modern tooling
- **Package Manager**: [Bun](https://bun.sh/) - Fast JavaScript runtime and package manager
- **Content Extraction**: [Defuddle](https://www.npmjs.com/package/defuddle) - Clean content extraction from web pages
- **Styling**: CSS Custom Properties with theme system matching Permaweb Glossary
- **Testing**: Vitest for unit testing

## 📦 Installation

```bash
# Clone the repository
git clone <repository-url>
cd permaweb-llms-builder

# Install dependencies
bun install

# Start development server (no pre-crawling needed!)
bun run dev
```

The application will automatically attempt to discover documentation pages when loaded. If CORS restrictions prevent live crawling, it will gracefully fall back to mock data for demonstration.

## 🚀 Development Scripts

```bash
# Development
bun run dev          # Start Astro dev server
bun run build        # Build for production
bun run preview      # Preview production build

# Data Generation
bun run crawl        # Crawl documentation sites and generate index
bun run build-index  # Alternative index generation script

# Testing
bun run test         # Run unit tests
bun run test:ui      # Run tests with UI
```

## 🌐 Iframe Embedding

The tool is designed to be iframe-compatible with extensive customization options:

### Basic Embedding

```html
<iframe 
  src="https://your-domain.com/permaweb-llms-builder/" 
  width="100%" 
  height="600px"
  frameborder="0">
</iframe>
```

### Advanced Customization

```html
<iframe 
  src="https://your-domain.com/permaweb-llms-builder/?hide-header=true&bg-color=%23f0f0f0&accent-color=%2329a879&translucent=0.9" 
  width="100%" 
  height="600px"
  frameborder="0">
</iframe>
```

### URL Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `hide-header` | boolean | Hide the main header | `hide-header=true` |
| `translucent` | number | Background opacity (0-1) | `translucent=0.9` |
| `bg-color` | hex | Background color | `bg-color=%23ffffff` |
| `text-color` | hex | Text color | `text-color=%23000000` |
| `accent-color` | hex | Accent/link color | `accent-color=%2329a879` |
| `border-color` | hex | Border color | `border-color=%23000000` |

## 🏗️ Architecture

```
permaweb-llms-builder/
├── src/
│   ├── pages/
│   │   └── index.astro          # Main application page
│   ├── styles/
│   │   └── theme.css            # Theme system (matches Permaweb Glossary)
│   ├── utils/
│   │   ├── crawler.js           # Documentation site crawler
│   │   ├── defuddle-fetch.js    # Content extraction utilities
│   │   └── theme.js             # Theme management
│   ├── components/              # Reusable Astro components
│   └── data/
│       └── docs-index.json      # Generated documentation index
├── test/                        # Unit tests
├── llm/                         # Generated llms.txt files
└── dist/                        # Build output
```

## 🗺️ Roadmap

### Phase 1: Core Functionality ✅
- [x] Basic Astro setup with Bun
- [x] Permaweb Glossary theme integration
- [x] Browser-compatible Defuddle integration
- [x] Interactive tree view with checkboxes
- [x] LLMs.txt generation and download
- [x] Iframe compatibility and URL parameters
- [x] Sample documentation index

### Phase 2: Enhanced Crawling 🚧
- [ ] Implement full site crawler with sitemap support
- [ ] Add support for additional documentation sites
- [ ] Implement intelligent content discovery
- [ ] Add rate limiting and respectful crawling
- [ ] Cache management for crawled content

### Phase 3: Advanced Features 📋
- [ ] Search and filter functionality within tree view
- [ ] Content preview before selection
- [ ] Batch operations (select by content type, date, etc.)
- [ ] Export formats beyond llms.txt (JSON, CSV, etc.)
- [ ] Content deduplication and similarity detection

### Phase 4: User Experience 📋
- [ ] Save and load selection presets
- [ ] Drag-and-drop reordering of selected content
- [ ] Real-time word count and estimated processing time
- [ ] Progress persistence across sessions
- [ ] Keyboard shortcuts for power users

### Phase 5: Integration & Deployment 📋
- [ ] GitHub Actions for automated crawling
- [ ] API endpoints for programmatic access
- [ ] Docker containerization
- [ ] Arweave deployment integration
- [ ] CDN optimization for global access

### Phase 6: Analytics & Optimization 📋
- [ ] Content quality scoring
- [ ] Usage analytics and popular selections
- [ ] Performance monitoring and optimization
- [ ] A/B testing for UI improvements
- [ ] Accessibility audit and improvements

## 🧪 Testing

The project includes comprehensive unit tests:

```bash
# Run all tests
bun run test

# Run tests with coverage
bun run test --coverage

# Run tests in watch mode
bun run test --watch
```

### Test Coverage Areas

- Content extraction and cleaning
- LLMs.txt generation formats
- Tree view rendering and selection logic
- Theme system and URL parameter handling
- Error handling and edge cases

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Use kebab-case for file names
- Use camelCase for variables and functions
- Use PascalCase for classes and constructors
- Write unit tests for new functionality
- Follow the existing code style and patterns
- Update documentation for new features

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Defuddle](https://www.npmjs.com/package/defuddle) by @kepano for clean content extraction
- [Permaweb Glossary](https://github.com/permaweb/glossary) for theme inspiration
- [Astro](https://astro.build/) team for the excellent static site generator
- [Bun](https://bun.sh/) team for the fast JavaScript runtime

## 🔗 Related Projects

- [Permaweb Glossary](https://github.com/permaweb/glossary) - Searchable glossary of Permaweb terms
- [Doc Selector Component](https://github.com/your-org/doc-selector-component) - Reusable documentation selector
- [AO Cookbook](https://cookbook_ao.arweave.net) - AO development documentation
- [Arweave Cookbook](https://cookbook.arweave.net) - Arweave development documentation

---

Built with ❤️ for the Permaweb ecosystem
