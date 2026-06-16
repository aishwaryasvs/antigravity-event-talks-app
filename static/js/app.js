// App State Configuration
const state = {
    feedTitle: 'BigQuery Release Notes',
    feedLink: 'https://cloud.google.com/bigquery/docs/release-notes',
    releases: [],         // Raw parsed release dates and updates
    allUpdatesMap: {},    // Map of uniqueUpdateId -> update details
    selectedUpdates: new Set(), // Set of selected update IDs
    filters: {
        search: '',
        types: new Set(['Feature', 'Issue', 'Change', 'Deprecated', 'Update'])
    },
    lastUpdated: null
};

// DOM Elements
const elements = {
    btnRefresh: document.getElementById('btn-refresh'),
    spinner: document.getElementById('spinner'),
    syncText: document.getElementById('sync-text'),
    searchBox: document.getElementById('search-box'),
    searchClear: document.getElementById('search-clear'),
    typeFilters: document.getElementById('type-filters'),
    statTotalReleases: document.getElementById('stat-total-releases'),
    statTotalUpdates: document.getElementById('stat-total-updates'),
    emptyState: document.getElementById('empty-state'),
    skeletonLoader: document.getElementById('skeleton-loader'),
    timelineContainer: document.getElementById('timeline-container'),
    timelineFeed: document.getElementById('timeline-feed'),
    selectionDrawer: document.getElementById('selection-drawer'),
    selectionCount: document.getElementById('selection-count'),
    btnTweetSelected: document.getElementById('btn-tweet-selected'),
    btnClearSelection: document.getElementById('btn-clear-selection'),
    btnExportCSV: document.getElementById('btn-export-csv'),
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    themeMoon: document.getElementById('theme-moon'),
    themeSun: document.getElementById('theme-sun'),
    
    // Modal elements
    tweetModal: document.getElementById('tweet-modal'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charRing: document.getElementById('char-ring'),
    charCountText: document.getElementById('char-count-text'),
    btnPostTweet: document.getElementById('btn-post-tweet')
};

// Helper: Colors and styles for categories
const CATEGORY_META = {
    'Feature': { color: '#10b981', rgb: '16, 185, 129' },
    'Issue': { color: '#f43f5e', rgb: '244, 63, 94' },
    'Change': { color: '#3b82f6', rgb: '59, 130, 246' },
    'Deprecated': { color: '#f59e0b', rgb: '245, 158, 11' },
    'Update': { color: '#8b5cf6', rgb: '139, 92, 246' }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupEventListeners();
    fetchReleases();
});

// Setup Event Listeners
function setupEventListeners() {
    // Refresh button
    elements.btnRefresh.addEventListener('click', () => fetchReleases(true));
    
    // CSV export
    elements.btnExportCSV.addEventListener('click', exportFilteredToCSV);
    
    // Theme toggle
    elements.btnThemeToggle.addEventListener('click', toggleTheme);
    
    // Search filter
    elements.searchBox.addEventListener('input', (e) => {
        state.filters.search = e.target.value.trim().toLowerCase();
        elements.searchClear.style.display = state.filters.search ? 'block' : 'none';
        renderFeed();
    });
    
    elements.searchClear.addEventListener('click', () => {
        elements.searchBox.value = '';
        state.filters.search = '';
        elements.searchClear.style.display = 'none';
        renderFeed();
    });

    // Checkbox Type Filters
    elements.typeFilters.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const val = e.target.value;
            if (e.target.checked) {
                state.filters.types.add(val);
            } else {
                state.filters.types.delete(val);
            }
            renderFeed();
        });
    });

    // Selection Drawer Actions
    elements.btnClearSelection.addEventListener('click', clearSelection);
    elements.btnTweetSelected.addEventListener('click', openTweetComposerForSelection);

    // Modal Events
    elements.btnCloseModal.addEventListener('click', closeModal);
    elements.tweetModal.addEventListener('click', (e) => {
        if (e.target === elements.tweetModal) closeModal();
    });
    elements.tweetTextarea.addEventListener('input', updateCharCounter);
    elements.btnPostTweet.addEventListener('click', publishTweet);
}

// Fetch Release Notes
async function fetchReleases(force = false) {
    // Show loading UI
    elements.spinner.classList.add('spinning');
    elements.btnRefresh.disabled = true;
    elements.syncText.textContent = force ? "Refreshing feed..." : "Loading release notes...";
    
    if (force) {
        elements.timelineContainer.style.display = 'none';
        elements.skeletonLoader.style.display = 'flex';
        elements.emptyState.style.display = 'none';
    }

    try {
        const response = await fetch(`/api/releases${force ? '?refresh=true' : ''}`);
        const result = await response.json();
        
        if (result.success) {
            state.releases = result.data.releases;
            state.feedTitle = result.data.title;
            state.feedLink = result.data.link;
            state.lastUpdated = new Date(result.last_updated);
            
            // Build updates map for quick selection lookups
            state.allUpdatesMap = {};
            state.releases.forEach(release => {
                release.updates.forEach((update, idx) => {
                    const uniqueId = `${release.id}_${idx}`;
                    state.allUpdatesMap[uniqueId] = {
                        id: uniqueId,
                        date: release.title,
                        link: release.link,
                        type: update.type,
                        text: update.text,
                        content: update.content
                    };
                });
            });

            // Update stats & counters
            updateCategoryStats();
            updateLastUpdatedUI();
            
            // Render feed
            renderFeed();
        } else {
            console.error("API error:", result.error);
            showErrorState(result.error);
        }
    } catch (err) {
        console.error("Fetch network error:", err);
        showErrorState("Could not connect to the server. Please check your backend.");
    } finally {
        elements.spinner.classList.remove('spinning');
        elements.btnRefresh.disabled = false;
        elements.skeletonLoader.style.display = 'none';
    }
}

// Update Last Updated Timestamp in UI
function updateLastUpdatedUI() {
    if (!state.lastUpdated) return;
    const pad = (n) => String(n).padStart(2, '0');
    const hours = pad(state.lastUpdated.getHours());
    const minutes = pad(state.lastUpdated.getMinutes());
    const seconds = pad(state.lastUpdated.getSeconds());
    elements.syncText.textContent = `Sync completed at ${hours}:${minutes}:${seconds}`;
}

// Calculate Category Counts & General Overview Stats
function updateCategoryStats() {
    // Counters dictionary
    const counts = { Feature: 0, Issue: 0, Change: 0, Deprecated: 0, Update: 0 };
    let totalUpdatesCount = 0;

    state.releases.forEach(release => {
        release.updates.forEach(update => {
            const type = update.type in counts ? update.type : 'Update';
            counts[type]++;
            totalUpdatesCount++;
        });
    });

    // Update capsule count badges
    document.getElementById('count-feature').textContent = counts.Feature;
    document.getElementById('count-issue').textContent = counts.Issue;
    document.getElementById('count-change').textContent = counts.Change;
    document.getElementById('count-deprecated').textContent = counts.Deprecated;
    document.getElementById('count-update').textContent = counts.Update;

    // Update Overview Stats
    elements.statTotalReleases.textContent = state.releases.length;
    elements.statTotalUpdates.textContent = totalUpdatesCount;
}

// Show Error state UI
function showErrorState(msg) {
    elements.timelineContainer.style.display = 'none';
    elements.emptyState.style.display = 'flex';
    elements.emptyState.querySelector('h3').textContent = "Connection Failed";
    elements.emptyState.querySelector('p').textContent = msg;
}

// Filter and Render Feed
function renderFeed() {
    const filteredReleases = [];
    const searchPattern = state.filters.search;
    
    state.releases.forEach(release => {
        const matchingUpdates = [];
        
        release.updates.forEach((update, idx) => {
            // Check Type filter
            const typeMatches = state.filters.types.has(update.type) || 
                               (!['Feature', 'Issue', 'Change', 'Deprecated'].includes(update.type) && state.filters.types.has('Update'));
            
            // Check Keyword Search filter
            let keywordMatches = true;
            if (searchPattern) {
                const textSearchable = (update.text + ' ' + update.type + ' ' + release.title).toLowerCase();
                keywordMatches = textSearchable.includes(searchPattern);
            }
            
            if (typeMatches && keywordMatches) {
                matchingUpdates.push({
                    originalIndex: idx,
                    ...update
                });
            }
        });
        
        if (matchingUpdates.length > 0) {
            filteredReleases.push({
                ...release,
                updates: matchingUpdates
            });
        }
    });

    // Render logic
    if (filteredReleases.length === 0) {
        elements.timelineContainer.style.display = 'none';
        elements.emptyState.style.display = 'flex';
        elements.emptyState.querySelector('h3').textContent = "No Matching Release Notes";
        elements.emptyState.querySelector('p').textContent = "Try adjusting your search criteria or toggling different categories in the sidebar.";
        return;
    }

    elements.emptyState.style.display = 'none';
    elements.timelineContainer.style.display = 'block';
    
    // Clear feed
    elements.timelineFeed.innerHTML = '';
    
    // Render timeline cards
    filteredReleases.forEach(release => {
        const dayNode = document.createElement('div');
        dayNode.className = 'day-node';
        
        // Marker dot
        const marker = document.createElement('div');
        marker.className = 'day-marker';
        dayNode.appendChild(marker);
        
        // Day Header
        const header = document.createElement('div');
        header.className = 'day-header';
        
        const title = document.createElement('h3');
        title.className = 'day-title';
        title.textContent = release.title;
        header.appendChild(title);
        
        const link = document.createElement('a');
        link.className = 'day-link';
        link.href = release.link;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.innerHTML = `
            <span>Docs Link</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
        `;
        header.appendChild(link);
        dayNode.appendChild(header);
        
        // Updates container
        const updatesContainer = document.createElement('div');
        updatesContainer.className = 'day-updates';
        
        release.updates.forEach(update => {
            const uniqueId = `${release.id}_${update.originalIndex}`;
            const isSelected = state.selectedUpdates.has(uniqueId);
            
            const meta = CATEGORY_META[update.type] || CATEGORY_META['Update'];
            
            const card = document.createElement('div');
            card.className = `update-card ${isSelected ? 'selected' : ''}`;
            card.dataset.id = uniqueId;
            card.setAttribute('style', `
                --type-color: ${meta.color};
                --badge-color-rgb: ${meta.rgb};
            `);
            
            // Card Event: Click to select (exclude clicks on links and action buttons)
            card.addEventListener('click', (e) => {
                if (e.target.tagName === 'A' || e.target.closest('a') || e.target.closest('.btn-card-tweet') || e.target.closest('.btn-card-copy')) {
                    return; // Prevent selecting card when clicking links/actions
                }
                toggleCardSelection(uniqueId);
            });
            
            // Card Header: Badge & Select checkbox & Tweet icon
            const cardHeader = document.createElement('div');
            cardHeader.className = 'card-header-row';
            
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = update.type;
            cardHeader.appendChild(badge);
            
            const actions = document.createElement('div');
            actions.className = 'card-actions';
            
            // Tweet Card Button
            const btnCardTweet = document.createElement('button');
            btnCardTweet.className = 'btn-card-tweet';
            btnCardTweet.title = 'Tweet about this update';
            btnCardTweet.innerHTML = `
                <svg class="icon btn-icon-x" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
            `;
            btnCardTweet.addEventListener('click', () => {
                openTweetComposerForSingle(uniqueId);
            });
            actions.appendChild(btnCardTweet);
            
            // Copy Card Button
            const btnCardCopy = document.createElement('button');
            btnCardCopy.className = 'btn-card-copy';
            btnCardCopy.title = 'Copy update to clipboard';
            btnCardCopy.innerHTML = `
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
            `;
            btnCardCopy.addEventListener('click', (e) => {
                e.stopPropagation();
                copyUpdateToClipboard(uniqueId, btnCardCopy);
            });
            actions.appendChild(btnCardCopy);
            
            // Custom selection Checkbox
            const checkboxLabel = document.createElement('label');
            checkboxLabel.className = 'select-checkbox-label';
            
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = isSelected;
            input.tabIndex = -1; // Click handled by parent card
            checkboxLabel.appendChild(input);
            
            const customBox = document.createElement('div');
            customBox.className = 'custom-checkbox';
            checkboxLabel.appendChild(customBox);
            
            actions.appendChild(checkboxLabel);
            cardHeader.appendChild(actions);
            card.appendChild(cardHeader);
            
            // Card Body Content (HTML rendered from BigQuery feed)
            const cardBody = document.createElement('div');
            cardBody.className = 'card-body';
            cardBody.innerHTML = update.content;
            card.appendChild(cardBody);
            
            updatesContainer.appendChild(card);
        });
        
        dayNode.appendChild(updatesContainer);
        elements.timelineFeed.appendChild(dayNode);
    });
}

// Toggle selection on a card
function toggleCardSelection(id) {
    if (state.selectedUpdates.has(id)) {
        state.selectedUpdates.delete(id);
    } else {
        state.selectedUpdates.add(id);
    }
    
    // Rerender specific card style or just full feed (full feed ensures drawer updates)
    renderFeed();
    updateSelectionDrawer();
}

// Clear all card selections
function clearSelection() {
    state.selectedUpdates.clear();
    renderFeed();
    updateSelectionDrawer();
}

// Update floating bottom drawer state
function updateSelectionDrawer() {
    const count = state.selectedUpdates.size;
    elements.selectionCount.textContent = count;
    
    if (count > 0) {
        elements.selectionDrawer.classList.add('active');
    } else {
        elements.selectionDrawer.classList.remove('active');
    }
}

// Generate pre-filled Tweet contents based on selections
function generateTweetText(selectedIds) {
    const items = selectedIds.map(id => state.allUpdatesMap[id]).filter(Boolean);
    if (items.length === 0) return '';
    
    if (items.length === 1) {
        const item = items[0];
        // Format single tweet
        const prefix = `[BigQuery Release - ${item.type}] (${item.date}): `;
        const suffix = `\n\nRead more: ${item.link}\n#BigQuery #GCP`;
        
        const reservedLen = prefix.length + suffix.length;
        const maxTextLen = 280 - reservedLen;
        
        let updateText = item.text.replace(/\s+/g, ' ');
        if (updateText.length > maxTextLen) {
            updateText = updateText.substring(0, maxTextLen - 3) + '...';
        }
        
        return `${prefix}${updateText}${suffix}`;
    } else {
        // Format combined tweet for multiple selections
        const prefix = `[BigQuery Updates] Summary:\n`;
        const suffix = `\n\nMore details: ${state.feedLink}\n#BigQuery #GCP`;
        
        // Build individual bullet descriptions
        let bullets = items.map(item => {
            const cleanText = item.text.replace(/\s+/g, ' ');
            return `- ${item.type} (${item.date}): ${cleanText}`;
        });
        
        let combinedBullets = bullets.join('\n');
        
        // If total combined exceeds 280 limit, compress bullet points
        if (prefix.length + combinedBullets.length + suffix.length > 280) {
            const maxBulletsLen = 280 - prefix.length - suffix.length;
            const targetBulletLen = Math.floor(maxBulletsLen / items.length) - 2; // Share space evenly
            
            bullets = items.map(item => {
                const label = `- ${item.type} (${item.date}): `;
                let text = item.text.replace(/\s+/g, ' ');
                const allowedTextLen = targetBulletLen - label.length;
                
                if (text.length > allowedTextLen) {
                    text = text.substring(0, Math.max(10, allowedTextLen - 3)) + '...';
                }
                return `${label}${text}`;
            });
            combinedBullets = bullets.join('\n');
        }
        
        return `${prefix}${combinedBullets}${suffix}`;
    }
}

// Open Tweet Composer Modal for a single update
function openTweetComposerForSingle(id) {
    const tweetText = generateTweetText([id]);
    openComposerModal(tweetText);
}

// Open Tweet Composer Modal for all selected updates
function openTweetComposerForSelection() {
    const selectedIds = Array.from(state.selectedUpdates);
    if (selectedIds.length === 0) return;
    
    const tweetText = generateTweetText(selectedIds);
    openComposerModal(tweetText);
}

// Open Composer Modal and focus
function openComposerModal(text) {
    elements.tweetTextarea.value = text;
    elements.tweetModal.classList.add('active');
    updateCharCounter();
    setTimeout(() => {
        elements.tweetTextarea.focus();
        // Set cursor to start
        elements.tweetTextarea.setSelectionRange(0, 0);
    }, 100);
}

// Close Tweet Composer Modal
function closeModal() {
    elements.tweetModal.classList.remove('active');
}

// Update Character limit display & progress ring
function updateCharCounter() {
    const text = elements.tweetTextarea.value;
    const len = text.length;
    const maxChars = 280;
    const remaining = maxChars - len;
    
    // Update numeric count text
    elements.charCountText.textContent = remaining;
    
    // Character progress indicator color classes
    if (remaining < 0) {
        elements.charCountText.style.color = '#f43f5e'; // Red
        elements.btnPostTweet.disabled = true;
    } else if (remaining <= 20) {
        elements.charCountText.style.color = '#f59e0b'; // Orange
        elements.btnPostTweet.disabled = false;
    } else {
        elements.charCountText.style.color = 'var(--text-muted)';
        elements.btnPostTweet.disabled = len === 0;
    }
    
    // Update SVG circle stroke dashoffset
    const circleCircumference = 69.1; // 2 * PI * r (r=11)
    const percentage = Math.min(100, (len / maxChars) * 100);
    const offset = circleCircumference - (percentage / 100) * circleCircumference;
    
    elements.charRing.style.strokeDashoffset = offset;
    
    // Color circle fill
    if (remaining < 0) {
        elements.charRing.style.stroke = '#f43f5e';
    } else if (remaining <= 20) {
        elements.charRing.style.stroke = '#f59e0b';
    } else {
        elements.charRing.style.stroke = 'var(--accent-blue)';
    }
}

// Trigger browser Web Intent to share on X/Twitter
function publishTweet() {
    const text = elements.tweetTextarea.value;
    if (text.length === 0 || text.length > 280) return;
    
    const xIntentUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(xIntentUrl, '_blank', 'noopener,noreferrer');
    
    closeModal();
    // Proactively clear selection after a successful compose
    clearSelection();
}

// Copy update details to clipboard
async function copyUpdateToClipboard(id, buttonEl) {
    const item = state.allUpdatesMap[id];
    if (!item) return;
    
    const textToCopy = `[BigQuery Release - ${item.type}] (${item.date})\n${item.text}\n\nRead more: ${item.link}`;
    
    try {
        await navigator.clipboard.writeText(textToCopy);
        
        // Show success visual state
        const originalHTML = buttonEl.innerHTML;
        buttonEl.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;
        buttonEl.title = 'Copied!';
        buttonEl.style.color = '#10b981';
        
        setTimeout(() => {
            buttonEl.innerHTML = originalHTML;
            buttonEl.title = 'Copy update to clipboard';
            buttonEl.style.color = '';
        }, 1500);
    } catch (err) {
        console.error('Failed to copy text: ', err);
    }
}

// Export currently filtered releases to a CSV file
function exportFilteredToCSV() {
    const searchPattern = state.filters.search;
    const csvRows = [];
    
    // Header
    csvRows.push(['Date', 'Type', 'Content', 'Link'].map(h => `"${h.replace(/"/g, '""')}"`).join(','));
    
    state.releases.forEach(release => {
        release.updates.forEach((update, idx) => {
            // Check Type filter
            const typeMatches = state.filters.types.has(update.type) || 
                               (!['Feature', 'Issue', 'Change', 'Deprecated'].includes(update.type) && state.filters.types.has('Update'));
            
            // Check Keyword Search filter
            let keywordMatches = true;
            if (searchPattern) {
                const textSearchable = (update.text + ' ' + update.type + ' ' + release.title).toLowerCase();
                keywordMatches = textSearchable.includes(searchPattern);
            }
            
            if (typeMatches && keywordMatches) {
                // Escape fields for CSV format
                const cleanDate = release.title.replace(/"/g, '""');
                const cleanType = update.type.replace(/"/g, '""');
                const cleanText = update.text.replace(/"/g, '""');
                const cleanLink = release.link.replace(/"/g, '""');
                
                csvRows.push(`"${cleanDate}","${cleanType}","${cleanText}","${cleanLink}"`);
            }
        });
    });
    
    if (csvRows.length <= 1) {
        alert('No matching updates to export.');
        return;
    }
    
    // Create Blob and download
    const csvContent = "\uFEFF" + csvRows.join("\n"); // Add BOM for Excel compatibility
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `bigquery_release_notes_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Theme management utilities
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
}

function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    if (theme === 'light') {
        elements.themeMoon.style.display = 'none';
        elements.themeSun.style.display = 'block';
    } else {
        elements.themeMoon.style.display = 'block';
        elements.themeSun.style.display = 'none';
    }
}

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}
