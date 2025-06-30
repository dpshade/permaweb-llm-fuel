// Main application script
import { initializeAllTheme } from "../utils/theme.js";
import {
	batchFetchAndClean,
	generateLLMsTxt,
	downloadFile,
	openContentInNewTab,
} from "../utils/defuddle-fetch.js";

// Type definitions
interface PageData {
	url: string;
	title: string;
	siteKey: string;
	siteName: string;
	breadcrumbs?: string[];
	estimatedWords: number;
	estimatedChars: number;
}

interface SiteData {
	name: string;
	description: string;
	pages: PageData[];
	crawledAt: string;
}

// Initialize theme system
initializeAllTheme();

// State management
let displayTree: Record<string, SiteData> = {};
let selectedPages = new Set<string>();
let allPages: PageData[] = [];
let configOrder: string[] = []; // Order from crawl-config.json

// DOM elements
const docsTree = document.getElementById("docs-tree");
const selectionCount = document.getElementById("selection-count");
const generateBtn = document.getElementById("generate-btn");
const selectAllBtn = document.getElementById("select-all-btn");
const clearAllBtn = document.getElementById("clear-all-btn");
const progressContainer = document.getElementById("progress-container");
const progressFill = document.getElementById("progress-fill");
const progressText = document.getElementById("progress-text");
const selectionDetails = document.getElementById("selection-details");
const selectionToggle = document.getElementById("selection-toggle");
const selectedPagesList = document.getElementById("selected-pages-list");
const estimatedChars = document.getElementById("estimated-chars");

// Initialize the application
async function initialize() {
	await loadConfigOrder();
	loadDocumentationIndex();
}

// Load config order to maintain site ordering
async function loadConfigOrder() {
	try {
		const response = await fetch("/crawl-config.json");
		const config = await response.json();
		configOrder = Object.keys(config);
		console.log("Config order loaded:", configOrder);
	} catch (error) {
		console.warn("Failed to load config order:", error);
		configOrder = [];
	}
}

// Load documentation index from pre-built data
async function loadDocumentationIndex() {
	try {
		const response = await fetch("/docs-index.json");
		const docsIndex = await response.json();
		// Process the index into display format
		displayTree = processIndex(docsIndex);
		allPages = extractAllPages(docsIndex);

		// Render the tree
		renderDocumentationTree();

		console.log(
			`Loaded documentation index: ${allPages.length} total pages from ${Object.keys(docsIndex.sites || {}).length} sites`,
		);
	} catch (error) {
		console.error("Failed to process documentation index:", error);
		showError(
			`Failed to process documentation index: ${error.message}`,
		);
	}
}

// Process index into display format
function processIndex(index: any): Record<string, SiteData> {
	const processed: Record<string, SiteData> = {};

	// Handle the new structure with sites object
	const sites = index.sites || {};

	for (const [siteKey, siteData] of Object.entries(sites)) {
		// Skip metadata entries
		if (siteKey === "_metadata" || siteKey === "generated") continue;

		const site = siteData as any;
		processed[siteKey] = {
			name: site.name,
			description: site.description,
			pages: site.pages || [],
			crawledAt: site.crawledAt,
		};
	}

	return processed;
}

// Extract all pages from index
function extractAllPages(index: any): PageData[] {
	const pages: PageData[] = [];

	// Handle the new structure with sites object
	const sites = index.sites || {};

	for (const [siteKey, siteData] of Object.entries(sites)) {
		// Skip metadata entries
		if (siteKey === "_metadata" || siteKey === "generated") continue;

		const site = siteData as any;
		// Use the flat pages array directly from the JSON structure
		if (site.pages && Array.isArray(site.pages)) {
			for (const page of site.pages) {
				// Use existing estimatedWords or calculate from title
				const estimatedWords =
					page.estimatedWords ||
					Math.max(300, page.title.length * 15);
				const estimatedChars = Math.round(
					estimatedWords * 5.5,
				);

				pages.push({
					...page,
					siteKey,
					siteName: site.name,
					estimatedWords: estimatedWords,
					estimatedChars: estimatedChars,
				});
			}
		}
	}

	return pages;
}

// Render documentation tree - hierarchical structure
function renderDocumentationTree() {
	if (!allPages.length || !docsTree) return;

	// Remove loading skeleton first
	const loadingSkeleton = document.getElementById("loading-skeleton");
	if (loadingSkeleton) {
		loadingSkeleton.remove();
	}

	const totalPages = allPages.length;
	const siteCount = Object.keys(displayTree).length;

	// Sort pages by config order, then by breadcrumb path
	const sortedPages = [...allPages].sort((a, b) => {
		if (a.siteKey !== b.siteKey) {
			// Sort by config order if available
			const aIndex = configOrder.indexOf(a.siteKey || '');
			const bIndex = configOrder.indexOf(b.siteKey || '');
			
			// If both sites are in config, sort by config order
			if (aIndex !== -1 && bIndex !== -1) {
				return aIndex - bIndex;
			}
			// If only one is in config, prioritize the one in config
			if (aIndex !== -1) return -1;
			if (bIndex !== -1) return 1;
			// If neither is in config, fall back to alphabetical
			return (a.siteName || '').localeCompare(b.siteName || '');
		}
		const pathA = a.breadcrumbs
			? a.breadcrumbs.join(" / ")
			: "";
		const pathB = b.breadcrumbs
			? b.breadcrumbs.join(" / ")
			: "";
		return pathA.localeCompare(pathB);
	});

	const treeHtml = `
		<div class="docs-summary">
			${totalPages} pages from ${siteCount} sites
		</div>
		<div id="tree-root" class="tree-font">
			${renderSitesWithPages(sortedPages)}
		</div>
	`;

	docsTree.innerHTML = treeHtml;
	// Add event listeners after DOM is rendered
	addTreeEventListeners();

	// Select all pages by default
	allPages.forEach((page) => {
		selectedPages.add(page.url);
	});

	updateSelectionCount();
}

// Render sites with their pages grouped together
function renderSitesWithPages(sortedPages: PageData[]): string {
	// Group pages by site
	const pagesBySite: Record<string, { siteName: string; pages: PageData[] }> = {};
	sortedPages.forEach((page) => {
		const siteKey = page.siteKey || 'unknown';
		if (!pagesBySite[siteKey]) {
			pagesBySite[siteKey] = {
				siteName: page.siteName || 'Unknown Site',
				pages: [],
			};
		}
		pagesBySite[siteKey].pages.push(page);
	});

	// Sort sites by config order
	const sortedSiteEntries = Object.entries(pagesBySite).sort(([siteKeyA], [siteKeyB]) => {
		const aIndex = configOrder.indexOf(siteKeyA);
		const bIndex = configOrder.indexOf(siteKeyB);
		
		// If both sites are in config, sort by config order
		if (aIndex !== -1 && bIndex !== -1) {
			return aIndex - bIndex;
		}
		// If only one is in config, prioritize the one in config
		if (aIndex !== -1) return -1;
		if (bIndex !== -1) return 1;
		// If neither is in config, fall back to alphabetical
		return siteKeyA.localeCompare(siteKeyB);
	});
	
	// Render each site with its pages
	return sortedSiteEntries
		.map(([siteKey, siteData]) => {
			const sitePageCount = siteData.pages.length;

			// Site header with expand/collapse
			let html = `
			<div class="mb-8">
				<div class="tree-site-header">
					<input type="checkbox" id="site-${siteKey}" class="site-checkbox" data-site="${siteKey}" checked>
					<div class="tree-site-content flex-center-gap" onclick="toggleNode('site-${siteKey}')">
						<svg class="world-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<circle cx="12" cy="12" r="10" stroke="#666" stroke-width="2"/>
							<path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="#666" stroke-width="2"/>
						</svg>
						<label class="tree-site-label">${siteData.siteName}</label>
						<span class="tree-site-count">${sitePageCount} pages</span>
						<svg class="tree-toggle icon-12 icon-transition" id="toggle-site-${siteKey}" style="margin-left: auto; transform: rotate(0deg);" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path fill-rule="evenodd" clip-rule="evenodd" d="M13.9394 12.0001L8.46973 6.53039L9.53039 5.46973L16.0607 12.0001L9.53039 18.5304L8.46973 17.4697L13.9394 12.0001Z" fill="#666"/>
						</svg>
					</div>
				</div>
				<div id="site-${siteKey}-children" class="site-children">
		`;

			// Site pages with breadcrumb paths
			siteData.pages.forEach((page) => {
				const pageId = `page-${page.siteKey}-${page.url.replace(/[^a-zA-Z0-9]/g, "-")}`;
				const breadcrumbPath =
					page.breadcrumbs && page.breadcrumbs.length > 0
						? page.breadcrumbs.join(" / ")
						: "Root";

				const specificTitle = generateSpecificTitle(page);
				html += `
					<div class="tree-page-item">
						<input type="checkbox" id="${pageId}" class="page-checkbox" data-url="${page.url}" data-site="${page.siteKey}" checked>
						<label for="${pageId}" class="tree-page-label">${specificTitle}</label>
						<a href="${page.url}" target="_blank" rel="noopener noreferrer" class="tree-page-link" 
						   onmouseover="this.style.textDecoration='underline'" 
						   onmouseout="this.style.textDecoration='none'">
							${breadcrumbPath}
						</a>
					</div>
				`;
			});

			// Close the collapsible section and add spacing
			html += `
				</div>
			</div>
			<div class="mb-16"></div>
		`;

			return html;
		})
		.join("");
}

// Global function for toggling tree nodes (accordion-style: only one open at a time)
function toggleNode(nodeId: string) {
	const children = document.getElementById(nodeId + "-children");
	const toggle = document.getElementById("toggle-" + nodeId);
	if (children && toggle) {
		const isExpanded = children.classList.contains("expanded");
		
		if (isExpanded) {
			// Collapse the currently expanded site
			children.classList.remove("expanded");
			toggle.style.transform = "rotate(0deg)";
		} else {
			// First, collapse all other expanded sites
			document.querySelectorAll('.site-children.expanded').forEach(expandedChild => {
				const siteId = expandedChild.id.replace('-children', '');
				const expandedToggle = document.getElementById("toggle-" + siteId);
				
				expandedChild.classList.remove("expanded");
				if (expandedToggle) {
					expandedToggle.style.transform = "rotate(0deg)";
				}
			});
			
			// Also collapse the selection details if it's expanded
			if (selectionDetails && selectionDetails.classList.contains("expanded")) {
				selectionDetails.classList.remove("expanded");
				if (selectionToggle) {
					selectionToggle.style.transform = "rotate(0deg)";
				}
			}
			
			// Then expand the clicked site
			children.classList.add("expanded");
			toggle.style.transform = "rotate(90deg)";
		}
	}
}

// Global function for toggling selection details
function toggleSelectionDetails() {
	if (!selectionDetails || !selectionToggle) return;
	
	const isExpanded = selectionDetails.classList.contains("expanded");
	if (isExpanded) {
		selectionDetails.classList.remove("expanded");
	} else {
		// When expanding selection details, collapse all expanded sites
		document.querySelectorAll('.site-children.expanded').forEach(expandedChild => {
			const siteId = expandedChild.id.replace('-children', '');
			const expandedToggle = document.getElementById("toggle-" + siteId);
			
			expandedChild.classList.remove("expanded");
			if (expandedToggle) {
				expandedToggle.style.transform = "rotate(0deg)";
			}
		});
		
		selectionDetails.classList.add("expanded");
	}
	selectionToggle.style.transform = isExpanded
		? "rotate(0deg)"
		: "rotate(90deg)";
}

// Add event listeners to tree
function addTreeEventListeners() {
	// Site checkboxes
	document
		.querySelectorAll(".site-checkbox")
		.forEach((checkbox) => {
			checkbox.addEventListener("change", (e) => {
				const target = e.target as HTMLInputElement;
				const siteKey = target.dataset.site;
				const isChecked = target.checked;

				// Toggle all pages in this site
				const sitePageCheckboxes =
					document.querySelectorAll(
						`input[data-site="${siteKey}"].page-checkbox`,
					);

				sitePageCheckboxes.forEach((pageCheckbox) => {
					const input = pageCheckbox as HTMLInputElement;
					input.checked = isChecked;
					const url = input.dataset.url;

					// Update selectedPages set directly
					if (isChecked && url) {
						selectedPages.add(url);
					} else if (url) {
						selectedPages.delete(url);
					}
				});

				// Update UI once after all changes
				updateSelectionCount();
			});
		});

	// Page checkboxes
	document
		.querySelectorAll(".page-checkbox")
		.forEach((checkbox) => {
			checkbox.addEventListener("change", (e) => {
				const target = e.target as HTMLInputElement;
				handlePageSelection(target, target.checked);
			});
		});
}

// Handle page selection
function handlePageSelection(checkbox: HTMLInputElement, isChecked: boolean) {
	const url = checkbox.dataset.url;

	if (isChecked && url) {
		selectedPages.add(url);
	} else if (url) {
		selectedPages.delete(url);
	}

	updateSelectionCount();
	updateSiteCheckboxes();
}

// Update site checkboxes based on their page selections
function updateSiteCheckboxes() {
	document
		.querySelectorAll(".site-checkbox")
		.forEach((siteCheckbox) => {
			const element = siteCheckbox as HTMLInputElement;
			const siteKey = element.dataset.site;
			const sitePageCheckboxes = document.querySelectorAll(
				`input[data-site="${siteKey}"].page-checkbox`,
			);

			const checkedPages = Array.from(
				sitePageCheckboxes,
			).filter((cb) => (cb as HTMLInputElement).checked);

			// Update site checkbox state
			if (checkedPages.length === 0) {
				element.checked = false;
				element.indeterminate = false;
			} else if (
				checkedPages.length === sitePageCheckboxes.length
			) {
				element.checked = true;
				element.indeterminate = false;
			} else {
				element.checked = false;
				element.indeterminate = true;
			}
		});
}

// Generate defuddle title (stripped, no spaces, no #, no MD, just raw text)
function generateDefuddleTitle(title: string): string {
	if (!title) return "Untitled";

	let cleaned = title;

	// Remove common site suffixes like " | Cookbook", " | Documentation", etc.
	cleaned = cleaned.replace(
		/\s*[|\-–—]\s*(Cookbook|Documentation|Docs|Guide|Tutorial|Help|Support|Home|Index|Main|Page)\s*$/i,
		"",
	);

	// Remove leading/trailing whitespace
	cleaned = cleaned.trim();

	// Remove markdown formatting
	cleaned = cleaned.replace(/[#*_`]/g, "");

	// Clean up extra whitespace
	cleaned = cleaned.replace(/\s+/g, " ").trim();

	return cleaned || "Untitled";
}

// Truncate text with ellipsis
function truncateText(text: string, maxLength: number = 55): string {
	if (!text || text.length <= maxLength) return text;
	return text.substring(0, maxLength - 3) + "...";
}

// Generate more specific title using breadcrumbs and context
function generateSpecificTitle(page: PageData): string {
	if (!page) return "Untitled";

	// Start with defuddle title as baseline
	const defuddleTitle = generateDefuddleTitle(page.title);

	// If no breadcrumbs or just filename, return truncated defuddle title
	if (!page.breadcrumbs || page.breadcrumbs.length === 0) {
		return truncateText(defuddleTitle);
	}

	// Extract meaningful breadcrumb context (ignore file extensions and generic terms)
	const meaningfulCrumbs = page.breadcrumbs
		.filter((crumb) => {
			// Remove file extensions and generic terms
			const cleaned = crumb
				.replace(/\.(html?|php|aspx?)$/i, "")
				.toLowerCase();
			return (
				cleaned !== "index" &&
				cleaned !== "main" &&
				cleaned !== "home" &&
				cleaned !== "default" &&
				cleaned.length > 1
			);
		})
		.map((crumb) => {
			// Clean and format breadcrumb
			let formatted = crumb.replace(
				/\.(html?|php|aspx?)$/i,
				"",
			);
			formatted = formatted.replace(/[-_]/g, " ");
			return (
				formatted.charAt(0).toUpperCase() +
				formatted.slice(1)
			);
		});

	// If we have meaningful breadcrumbs, try to create a more specific title
	if (meaningfulCrumbs.length > 0) {
		const context = meaningfulCrumbs.join(" / ");

		// Check if the defuddle title already contains the context
		const titleLower = defuddleTitle.toLowerCase();
		const contextLower = context.toLowerCase();

		// If title already includes the context, just return truncated defuddle title
		if (
			titleLower.includes(contextLower) ||
			contextLower.includes(titleLower)
		) {
			return truncateText(defuddleTitle);
		}

		// Create contextual title - but keep it concise
		// Only add context if it's not too long and adds value
		if (context.length < 30 && meaningfulCrumbs.length <= 2) {
			const fullTitle = `${defuddleTitle} (${context})`;
			return truncateText(fullTitle);
		}
	}

	return truncateText(defuddleTitle);
}

// Function to enable/disable UI elements during generation
function setUIEnabled(enabled: boolean) {
	// Disable/enable generate button
	if (generateBtn) {
		(generateBtn as HTMLButtonElement).disabled = !enabled || selectedPages.size === 0;
	}

	// Disable/enable select all and clear all buttons
	if (selectAllBtn) (selectAllBtn as HTMLButtonElement).disabled = !enabled;
	if (clearAllBtn) (clearAllBtn as HTMLButtonElement).disabled = !enabled;

	// Disable/enable all checkboxes
	const allCheckboxes = document.querySelectorAll(
		'input[type="checkbox"]',
	);
	allCheckboxes.forEach((checkbox) => {
		(checkbox as HTMLInputElement).disabled = !enabled;
	});

	// Update visual state
	if (generateBtn) {
		if (enabled) {
			generateBtn.classList.remove("generating");
			generateBtn.textContent = "Generate llms.txt";
		} else {
			generateBtn.classList.add("generating");
			generateBtn.textContent = "Generating...";
		}
	}
}

// Update selection count
function updateSelectionCount() {
	const selectedCount = selectedPages.size;

	// Update the basic count
	if (selectionCount) {
		selectionCount.textContent = selectedCount.toString();
	}

	// Calculate total estimated characters for selected pages
	let totalEstimatedChars = 0;
	selectedPages.forEach((url) => {
		const page = allPages.find((p) => p.url === url);
		if (page && page.estimatedChars) {
			totalEstimatedChars += page.estimatedChars;
		}
	});

	// Format the character count for display
	const formatChars = (chars: number) => {
		if (chars < 1000) return `${chars} chars`;
		if (chars < 1000000)
			return `${(chars / 1000).toFixed(1)}K chars`;
		return `${(chars / 1000000).toFixed(1)}M chars`;
	};

	// Update estimated characters display
	if (estimatedChars) {
		if (selectedCount === 0 || totalEstimatedChars === 0) {
			estimatedChars.textContent = "";
		} else {
			estimatedChars.textContent = `≈${formatChars(totalEstimatedChars)}`;
		}
	}

	if (generateBtn) {
		(generateBtn as HTMLButtonElement).disabled = selectedCount === 0;
	}
	updateSelectedPagesList();
}

// Update the selected pages list with breadcrumb paths
function updateSelectedPagesList() {
	if (!selectedPagesList) return;
	
	if (selectedPages.size === 0) {
		selectedPagesList.innerHTML = "<em>No pages selected</em>";
		return;
	}

	const selectedPagesData: Array<{
		title: string;
		url: string;
		siteName: string;
		siteKey: string;
		breadcrumbPath: string;
	}> = [];

	// Collect data for selected pages
	selectedPages.forEach((url) => {
		const page = allPages.find((p) => p.url === url);
		if (page) {
			const breadcrumbPath =
				page.breadcrumbs && page.breadcrumbs.length > 0
					? page.breadcrumbs.join(" / ")
					: "Root";

			selectedPagesData.push({
				title: generateSpecificTitle(page),
				url: page.url,
				siteName: page.siteName || 'Unknown Site',
				siteKey: page.siteKey || 'unknown',
				breadcrumbPath: breadcrumbPath,
			});
		}
	});

	// Sort by config order then by breadcrumb path
	selectedPagesData.sort((a, b) => {
		if (a.siteKey !== b.siteKey) {
			// Sort by config order if available
			const aIndex = configOrder.indexOf(a.siteKey);
			const bIndex = configOrder.indexOf(b.siteKey);
			
			// If both sites are in config, sort by config order
			if (aIndex !== -1 && bIndex !== -1) {
				return aIndex - bIndex;
			}
			// If only one is in config, prioritize the one in config
			if (aIndex !== -1) return -1;
			if (bIndex !== -1) return 1;
			// If neither is in config, fall back to alphabetical
			return a.siteName.localeCompare(b.siteName);
		}
		return a.breadcrumbPath.localeCompare(b.breadcrumbPath);
	});

	// Generate HTML
	const listHtml = selectedPagesData
		.map(
			(page) => `
		<div class="selection-page-item">
			<div class="selection-page-title">${page.title}</div>
			<div class="selection-page-meta">
				${page.siteName} → <a href="${page.url}" target="_blank" rel="noopener noreferrer" class="selection-page-link" 
				onmouseover="this.style.textDecoration='underline'" 
				onmouseout="this.style.textDecoration='none'">${page.breadcrumbPath}</a>
			</div>
		</div>
	`,
		)
		.join("");

	selectedPagesList.innerHTML = listHtml;
}

// Show error message
function showError(message: string) {
	if (!docsTree) return;
	
	// Remove loading skeleton first
	const loadingSkeleton = document.getElementById("loading-skeleton");
	if (loadingSkeleton) {
		loadingSkeleton.remove();
	}
	
	docsTree.innerHTML = `
		<div style="padding: 32px; text-align: center; color: var(--ao-error-color, #dc3545);">
			<h3>❌ Error</h3>
			<p>${message}</p>
			<button class="btn" onclick="location.reload()">Retry</button>
		</div>
	`;
}

// Action button handlers
if (selectAllBtn) {
	selectAllBtn.addEventListener("click", () => {
		// First, update all checkboxes immediately for instant visual feedback
		const pageCheckboxes =
			document.querySelectorAll(".page-checkbox");
		const siteCheckboxes =
			document.querySelectorAll(".site-checkbox");

		// Update page checkboxes visually first
		pageCheckboxes.forEach((checkbox) => {
			(checkbox as HTMLInputElement).checked = true;
		});

		// Update site checkboxes visually first
		siteCheckboxes.forEach((checkbox) => {
			const input = checkbox as HTMLInputElement;
			input.checked = true;
			input.indeterminate = false;
		});

		// Then batch update the data structures
		requestAnimationFrame(() => {
			// Clear and rebuild selectedPages set efficiently
			selectedPages.clear();
			pageCheckboxes.forEach((checkbox) => {
				const input = checkbox as HTMLInputElement;
				if (input.dataset.url) {
					selectedPages.add(input.dataset.url);
				}
			});

			// Update counts once at the end
			updateSelectionCount();
		});
	});
}

if (clearAllBtn) {
	clearAllBtn.addEventListener("click", () => {
		// Update UI immediately for instant visual feedback
		document
			.querySelectorAll('input[type="checkbox"]')
			.forEach((checkbox) => {
				const input = checkbox as HTMLInputElement;
				input.checked = false;
				input.indeterminate = false;
			});

		// Then batch update the data structures
		requestAnimationFrame(() => {
			selectedPages.clear();
			updateSelectionCount();
		});
	});
}

if (generateBtn) {
	generateBtn.addEventListener("click", async () => {
		if (selectedPages.size === 0) return;

		try {
			// Disable UI elements during generation
			setUIEnabled(false);

			// Show progress
			if (progressContainer) {
				progressContainer.style.display = "block";
			}
			if (progressText) {
				progressText.textContent = `Fetching ${selectedPages.size} pages...`;
			}

			const selectedUrls = Array.from(selectedPages);

			// Use the enhanced batch processing with optimized parallel processing
			const batchResult = await batchFetchAndClean(selectedUrls, {
				concurrency: 5,
				qualityThreshold: 0.3,
				useOptimizedBatch: true,
				onProgress: (
					completed,
					total,
					currentUrl,
					qualityScore,
				) => {
					const percent = Math.round(
						(completed / total) * 100,
					);
					if (progressFill) {
						progressFill.style.width = `${percent}%`;
					}

					// Enhanced progress text with quality info
					if (progressText) {
						if (qualityScore !== undefined) {
							progressText.textContent = `Processing: ${completed}/${total} (${percent}%)`;
						} else {
							progressText.textContent = `Processing: ${completed}/${total} (${percent}%)`;
						}
					}
				},
				onError: (url, error) => {
					console.warn(
						`Failed to process ${url}:`,
						error.message,
					);
				},
				onQualityFilter: (url, score, reason) => {
					console.log(
						`Filtered low-quality content from ${url}: ${reason} (Score: ${score.toFixed(2)})`,
					);
				},
			});

			// Extract results array from batch result
			const cleanedPages = batchResult.results || batchResult;

			// Show processing summary
			if (batchResult.summary && progressText) {
				const { total, successful, failed } =
					batchResult.summary;
				progressText.textContent = `Processed ${successful}/${total} pages successfully. Generating document...`;
			} else if (progressText) {
				progressText.textContent = "Generating llms.txt...";
			}

			// Generate LLMs.txt
			const llmsTxt = generateLLMsTxt(cleanedPages);

			// Open content in new tab
			const timestamp = new Date().toISOString().split("T")[0];
			const filename = `permaweb-docs-${timestamp}.llms.txt`;

			try {
				// Open in new tab to view raw content
				openContentInNewTab(llmsTxt, filename);

				if (progressText) {
					progressText.textContent = `Document generated successfully! Opening in new tab...`;
				}
			} catch (error) {
				console.error(
					"Failed to open in new tab, falling back to download:",
					error,
				);
				// Fallback to download if new tab fails (e.g., popup blocked)
				downloadFile(llmsTxt, filename, "text/plain");
				if (progressText) {
					progressText.textContent = `Document downloaded (popup blocked)`;
				}
			}

			// Hide progress with success message
			if (batchResult.summary && progressText) {
				const { successful, failed } = batchResult.summary;
				progressText.textContent = `Generated document with ${successful} pages${failed > 0 ? ` (${failed} failed)` : ""}`;
				setUIEnabled(true); // Re-enable UI immediately after success
				setTimeout(() => {
					if (progressContainer) {
						progressContainer.style.display = "none";
					}
				}, 1500);
			} else {
				if (progressContainer) {
					progressContainer.style.display = "none";
				}
				setUIEnabled(true); // Re-enable UI after success
			}
		} catch (error) {
			console.error("Generation failed:", error);
			if (progressText) {
				progressText.textContent = `❌ Error: ${error.message}`;
			}
			setUIEnabled(true); // Re-enable UI after error
			setTimeout(() => {
				if (progressContainer) {
					progressContainer.style.display = "none";
				}
			}, 5000);
		}
	});
}

// Make functions available globally
(window as any).toggleNode = toggleNode;
(window as any).toggleSelectionDetails = toggleSelectionDetails;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", initialize); 