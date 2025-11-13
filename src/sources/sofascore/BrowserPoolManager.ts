import puppeteer from 'puppeteer-core';
const { chrome } = require('chrome-paths');
import { Browser, Page } from 'puppeteer-core';
import { promises as fs } from 'fs';
import path from 'path';

interface EventApiData {
    [endpoint: string]: any;
}

/**
 * Browser Pool Manager - Manages multiple browser instances to distribute load
 * Each browser handles a subset of events to prevent memory issues
 * 
 * CONFIGURATION:
 * - BROWSERS_COUNT: Number of browser instances (more = higher capacity, more RAM)
 * - TABS_PER_BROWSER: Max tabs per browser (0 = unlimited per browser)
 * - MAX_TOTAL_EVENTS: Total capacity across all browsers (0 = unlimited, recommended for production)
 * 
 * Examples:
 * - For 100 events: BROWSERS_COUNT=5, TABS_PER_BROWSER=20, MAX_TOTAL_EVENTS=100
 * - For unlimited: BROWSERS_COUNT=5, TABS_PER_BROWSER=0, MAX_TOTAL_EVENTS=0
 * - For 24GB RAM: BROWSERS_COUNT=5-6 (each browser ~2GB)
 */
export class BrowserPoolManager {
    private browsers: Browser[] = [];
    private eventTabs: Map<string, { browser: Browser; page: Page; browserIndex: number; event: any; url: string; sportSlug: string }> = new Map();
    private eventDataCache: Map<string, EventApiData> = new Map();
    private savedEvents: Set<string> = new Set(); // Track which events have been saved to avoid duplicates
    
    private readonly BROWSERS_COUNT = 3; // Number of browser instances (each ~2GB) - Reduced from 5 to lower memory pressure
    private readonly TABS_PER_BROWSER = 0; // Max tabs per browser (0 = unlimited)
    private readonly MAX_TOTAL_EVENTS = 0; // Total capacity: 0 = unlimited, auto-cleanup handles resource management
    
    private browserTabCounts: number[] = [];
    private browserHealth: boolean[] = []; // Tracks if browsers are connected
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
    
    constructor() {
        this.browserTabCounts = new Array(this.BROWSERS_COUNT).fill(0);
        this.browserHealth = new Array(this.BROWSERS_COUNT).fill(false);
    }
    
    /**
     * Initialize browser pool
     */
    async initialize(): Promise<void> {
        console.log(`🌐 [BROWSER POOL] Initializing ${this.BROWSERS_COUNT} browser instances...`);
        
        const browserPromises = [];
        for (let i = 0; i < this.BROWSERS_COUNT; i++) {
            browserPromises.push(this.launchBrowser(i));
        }
        
        this.browsers = await Promise.all(browserPromises);
        console.log(`✅ [BROWSER POOL] ${this.browsers.length} browsers ready`);
        
        this.startHealthChecks();
        this.logMemoryUsage();
    }
    
    /**
     * Save event data to JSON file (organized by sport)
     */
    private async saveEventDataToFile(eventId: string, eventData: EventApiData, sportSlug: string): Promise<void> {
        // Check if file saving is enabled
        const saveEnabled = process.env.SAVE_SOFASCORE_EVENT_FILES === 'true';
        if (!saveEnabled) {
            return;
        }
        
        // Only save if we haven't saved this event yet and it has data
        if (this.savedEvents.has(eventId) || Object.keys(eventData).length === 0) {
            return;
        }
        
        try {
            const dirPath = path.join(process.cwd(), 'sofascore', 'events', sportSlug);
            await fs.mkdir(dirPath, { recursive: true });
            
            const filePath = path.join(dirPath, `${eventId}.json`);
            await fs.writeFile(filePath, JSON.stringify(eventData, null, 2), 'utf-8');
            
            this.savedEvents.add(eventId);
            console.log(`[SOFASCORE] ✅ Saved data for event ${eventId} to sofascore/events/${sportSlug}/${eventId}.json`);
        } catch (error: any) {
            console.error(`[SOFASCORE] ❌ Error saving data for event ${eventId}:`, error.message);
        }
    }
    
    /**
     * Launch a single browser instance
     */
    private async launchBrowser(index: number): Promise<Browser> {
        console.log(`   🚀 Launching browser ${index + 1}/${this.BROWSERS_COUNT}...`);
        
        try {
            const browser = await puppeteer.launch({
                executablePath: chrome,
                headless: true, // Use true for production, false for debugging
                protocolTimeout: 300000, // 300 seconds (5 min) - increased for better stability
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-extensions',
                    '--disable-background-networking',
                    '--disable-default-apps',
                    '--disable-sync',
                    '--disable-translate',
                    '--hide-scrollbars',
                    '--metrics-recording-only',
                    '--mute-audio',
                    '--no-default-browser-check',
                    '--safebrowsing-disable-auto-update',
                    '--disable-blink-features=AutomationControlled',
                    `--window-size=1920,1080`, // Laptop screen dimensions to load all widgets
                    '--disable-features=site-per-process', // Reduce memory per tab
                    '--renderer-process-limit=3', // Limit to 3 renderer processes per browser (was 10)
                    '--max-old-space-size=768', // 768MB heap per browser (was 512MB)
                    '--js-flags=--max-old-space-size=768',
                    '--disable-web-security', // Reduce security overhead
                    '--disable-webgl', // Disable WebGL to save memory
                    '--disable-software-rasterizer', // Disable software rasterizer
                    '--disable-background-timer-throttling', // Prevent tab throttling
                    '--disable-backgrounding-occluded-windows', // Keep background tabs responsive
                    '--memory-pressure-off', // Disable memory pressure warnings
                    '--max_old_space_size=768', // Alternative Node memory limit flag
                ],
            });

            this.browserHealth[index] = true;
            console.log(`   ✅ Browser ${index + 1} launched successfully.`);
            
            // Add a listener for when the browser disconnects
            browser.on('disconnected', () => {
                console.error(`❌ [HEALTH] Browser ${index + 1} has disconnected!`);
                this.browserHealth[index] = false;
            });

            return browser;

        } catch (error: any) {
            console.error(`❌ Failed to launch browser ${index + 1}: ${error.message}`);
            this.browserHealth[index] = false;
            throw error; // Re-throw to be handled by initialize
        }
    }
    
    /**
     * Get the browser with least tabs from the pool of healthy browsers
     */
    private getLeastLoadedBrowserIndex(): number {
        let minIndex = -1;
        let minCount = Infinity;

        for (let i = 0; i < this.browserTabCounts.length; i++) {
            // Only consider healthy, connected browsers
            if (this.browserHealth[i] && this.browserTabCounts[i] < minCount) {
                minCount = this.browserTabCounts[i];
                minIndex = i;
            }
        }

        if (minIndex === -1) {
            console.error("❌ No healthy browsers available!");
            // Optional: Could trigger an emergency recovery action here
        }

        return minIndex;
    }
    
    /**
     * Open event tab for live monitoring
     */
    async openEventTab(event: any, eventUrl: string): Promise<EventApiData> {
        const eventId = event.id.toString();
        
        // Check if already monitoring this event
        if (this.eventTabs.has(eventId)) {
            console.log(`♻️  [BROWSER POOL] Event ${eventId} already being monitored`);
            return this.eventDataCache.get(eventId) || {};
        }
        
        // Check total capacity (only if MAX_TOTAL_EVENTS > 0)
        if (this.MAX_TOTAL_EVENTS > 0) {
            const totalActiveTabs = this.eventTabs.size;
            if (totalActiveTabs >= this.MAX_TOTAL_EVENTS) {
                console.warn(`⚠️  [BROWSER POOL] Max capacity reached (${this.MAX_TOTAL_EVENTS} events). Skipping event ${eventId}`);
                return {};
            }
        }
        
        // Find browser with least load
        const browserIndex = this.getLeastLoadedBrowserIndex();
        
        if (browserIndex === -1) {
            console.error(`❌ Cannot open event tab for ${eventId}. No healthy browsers available.`);
            return {};
        }

        // Check if this specific browser is at capacity (only if TABS_PER_BROWSER > 0)
        if (this.TABS_PER_BROWSER > 0 && this.browserTabCounts[browserIndex] >= this.TABS_PER_BROWSER) {
            console.warn(`⚠️  [BROWSER POOL] Browser ${browserIndex + 1} at capacity (${this.TABS_PER_BROWSER} tabs). Trying to distribute...`);
            
            // Try to find ANY browser with space
            let foundBrowser = false;
            for (let i = 0; i < this.BROWSERS_COUNT; i++) {
                if (this.browserTabCounts[i] < this.TABS_PER_BROWSER) {
                    // Use this browser instead
                    foundBrowser = true;
                    break;
                }
            }
            
            if (!foundBrowser) {
                console.warn(`⚠️  [BROWSER POOL] All browsers at capacity. Skipping event ${eventId}`);
                return {};
            }
        }
        
        const browser = this.browsers[browserIndex];
        const interceptedData: EventApiData = {};
        let page: Page | null = null;

        try {
            // 1. Create a lightweight blank page first
            page = await browser.newPage();
            
            // Set viewport to laptop dimensions (1920x1080) to ensure all widgets load
            await page.setViewport({
                width: 1920,
                height: 1080,
                deviceScaleFactor: 1,
            });
            
            await page.goto('about:blank', { waitUntil: 'domcontentloaded' });

            // 2. Enable request interception to capture responses before browser consumes them
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setRequestInterception(true);
            
            // Store responses by request ID to match with requests
            const pendingRequests = new Map<string, string>();
            
            // Intercept requests and store their IDs
            page.on('request', (request: any) => {
                const url = request.url();
                if (url.includes('www.sofascore.com/api/v1/')) {
                    pendingRequests.set(request._requestId, url);
                }
                request.continue();
            });
            
            // Intercept responses using request interception approach
            page.on('response', async (response: any) => {
                const url = response.url();
                
                // Only process SofaScore API JSON responses
                if (!url.includes('www.sofascore.com/api/v1/')) return;
                
                try {
                    const statusCode = response.status();
                    if (statusCode >= 400) return;
                    
                    const contentType = response.headers()['content-type'] || '';
                    if (!contentType.includes('application/json')) return;
                    
                    const endpointMatch = url.match(/api\/v1\/(.+?)(?:\?|$)/);
                    if (!endpointMatch) return;
                    
                    const endpoint = endpointMatch[1];
                    
                    // Filter out noise
                    if (endpoint.includes('/image') || endpoint.includes('/flag') || endpoint.includes('/logo')) return;
                    
                    // Use buffer() instead of json() to avoid body consumption issues
                    const buffer = await response.buffer();
                    const text = buffer.toString('utf-8');
                    const data = JSON.parse(text);
                    
                    if (data?.error || data?.errors) return;
                    
                    // Store it
                    interceptedData[endpoint] = data;
                    const cachedData = this.eventDataCache.get(eventId) || {};
                    cachedData[endpoint] = data;
                    this.eventDataCache.set(eventId, cachedData);
                    
                    console.log(`📥 [Browser ${browserIndex + 1}] Event ${eventId} - Captured: ${endpoint}`);
                    
                    // Save periodically
                    if (Object.keys(cachedData).length >= 5 && !this.savedEvents.has(eventId)) {
                        const sportSlug = event.tournament?.category?.sport?.slug || 'unknown';
                        await this.saveEventDataToFile(eventId, cachedData, sportSlug);
                        this.savedEvents.add(eventId);
                    }
                } catch (error: any) {
                    // Log failures for critical endpoints
                    const endpointMatch = url.match(/api\/v1\/(.+?)(?:\?|$)/);
                    const endpoint = endpointMatch ? endpointMatch[1] : url;
                    if (endpoint.includes('statistics') || endpoint.includes('h2h') || 
                        endpoint.includes('standings') || endpoint.includes('lineups')) {
                        console.log(`⚠️  [Browser ${browserIndex + 1}] Event ${eventId} - Failed to capture ${endpoint}: ${error.message}`);
                    }
                }
            });

            // Track tab here, before navigation, to allow for cleanup on failure
            const sportSlug = event.tournament?.category?.sport?.slug || 'unknown';
            this.eventTabs.set(eventId, { browser, page, browserIndex, event, url: eventUrl, sportSlug });
            this.browserTabCounts[browserIndex]++;
            this.eventDataCache.set(eventId, interceptedData);

            console.log(`🌐 [Browser ${browserIndex + 1}] Event ${eventId} - ${event.slug}`);
            console.log(`   URL: ${eventUrl}`);
            
            // 3. Now, navigate to the actual URL
            await page.goto(eventUrl, {
                waitUntil: 'load', // Wait for DOM to load (networkidle2 never triggers due to continuous live updates)
                timeout: 90000, // 90-second navigation timeout
            });
            
            // 4. Wait for all widget endpoints to load
            // SofaScore fires all endpoints automatically on page load (no interaction needed)
            // Critical endpoints: statistics, h2h, standings/total, odds/1/all
            console.log(`⏳ [Browser ${browserIndex + 1}] Event ${eventId} - Waiting for all widget endpoints to load...`);
            
            // Initial wait for page to settle and fire initial requests
            await new Promise(resolve => setTimeout(resolve, 5000));
            let previousCount = Object.keys(interceptedData).length;
            console.log(`📊 [Browser ${browserIndex + 1}] Event ${eventId} - Initial capture: ${previousCount} endpoints`);
            
            // Keep waiting as long as new endpoints are being captured (up to 60 seconds total)
            let idleIterations = 0;
            const maxIdleIterations = 5; // Stop after 15 seconds of no new endpoints (5 × 3s)
            const maxTotalIterations = 20; // Max 60 seconds total wait (20 × 3s)
            
            for (let i = 0; i < maxTotalIterations; i++) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                const currentCount = Object.keys(interceptedData).length;
                
                if (currentCount > previousCount) {
                    console.log(`📊 [Browser ${browserIndex + 1}] Event ${eventId} - Captured ${currentCount} endpoints (+${currentCount - previousCount} new)`);
                    previousCount = currentCount;
                    idleIterations = 0; // Reset idle counter
                } else {
                    idleIterations++;
                    if (idleIterations >= maxIdleIterations) {
                        console.log(`✋ [Browser ${browserIndex + 1}] Event ${eventId} - No new endpoints for ${maxIdleIterations * 3}s, stopping wait`);
                        break;
                    }
                }
            }
            
            const capturedEndpoints = Object.keys(interceptedData).length;
            const endpointList = Object.keys(interceptedData).join(', ');
            console.log(`✅ [Browser ${browserIndex + 1}] Event ${eventId} - Monitoring live (${capturedEndpoints} endpoints captured)`);
            console.log(`📋 [Browser ${browserIndex + 1}] Event ${eventId} - Endpoints: ${endpointList}`);
            
            // Log distribution periodically
            const totalActiveTabs = this.eventTabs.size;
            if (totalActiveTabs % 10 === 0) {
                this.logDistribution();
            }
            
        } catch (error: any) {
            console.error(`❌ [Browser ${browserIndex + 1}] Event ${eventId}: ${error.message}`);
            console.error(`   URL: ${eventUrl}`);
            // If navigation fails, close the tab and clean up resources
            if (page) {
                await this.closeEventTab(eventId);
            }
        }
        
        return interceptedData;
    }
    
    /**
     * Close event tab when event finishes
     */
    async closeEventTab(eventId: string): Promise<void> {
        const tabInfo = this.eventTabs.get(eventId);
        if (!tabInfo) {
            return;
        }
        
        try {
            await tabInfo.page.close();
            this.eventTabs.delete(eventId);
            this.eventDataCache.delete(eventId);
            this.browserTabCounts[tabInfo.browserIndex]--;
            
            console.log(`🗑️  [Browser ${tabInfo.browserIndex + 1}] Closed event ${eventId}`);
        } catch (error) {
            console.error(`❌ Error closing event ${eventId}:`, error);
        }
    }
    
    /**
     * Check if an event is already being monitored
     */
    isEventMonitored(eventId: string): boolean {
        return this.eventTabs.has(eventId);
    }
    
    /**
     * Get cached data for an event (returns live-updated data)
     */
    getEventData(eventId: string): EventApiData {
        return this.eventDataCache.get(eventId) || {};
    }
    
    /**
     * Get all cached event data (for consolidation)
     */
    getAllEventData(): Map<string, EventApiData> {
        return this.eventDataCache;
    }
    
    /**
     * Close all tabs and browsers
     */
    async cleanup(): Promise<void> {
        console.log('🧹 [BROWSER POOL] Cleaning up all browsers...');
        
        // Close all tabs first
        for (const [eventId, tabInfo] of this.eventTabs.entries()) {
            try {
                await tabInfo.page.close();
            } catch (error) {
                // Ignore
            }
        }
        
        // Close all browsers
        for (const browser of this.browsers) {
            try {
                await browser.close();
            } catch (error) {
                // Ignore
            }
        }
        
        this.eventTabs.clear();
        this.eventDataCache.clear();
        this.browsers = [];
        this.browserTabCounts = [];
        this.browserHealth = [];

        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        console.log('✅ [BROWSER POOL] Cleanup complete');
    }
    
    /**
     * Log browser load distribution
     */
    private logDistribution(): void {
        console.log(`📊 [BROWSER POOL] Distribution: ${this.browserTabCounts.map((count, i) => `B${i + 1}:${count}`).join(' | ')} (Total: ${this.eventTabs.size})`);
    }
    
    /**
     * Starts the periodic health check of browser instances
     */
    private startHealthChecks(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(() => {
            this.healthCheck();
        }, this.HEALTH_CHECK_INTERVAL);

        console.log(`🩺 [HEALTH] Started periodic health checks (${this.HEALTH_CHECK_INTERVAL / 1000}s interval).`);
    }

    /**
     * Checks the health of all browsers in the pool and replaces any that have crashed.
     */
    private async healthCheck(): Promise<void> {
        console.log('🩺 [HEALTH] Performing browser health check...');
        let replacedCount = 0;

        for (let i = 0; i < this.browsers.length; i++) {
            const isConnected = this.browsers[i] && this.browsers[i].isConnected();
            
            if (!isConnected) { // Browser is disconnected
                if (this.browserHealth[i]) {
                    // First time detecting disconnection
                    console.warn(`⚠️ [HEALTH] Browser ${i + 1} is disconnected. Attempting to replace...`);
                } else {
                    // Still disconnected, try to replace again
                    console.warn(`⚠️ [HEALTH] Browser ${i + 1} still disconnected. Retrying replacement...`);
                }
                
                this.browserHealth[i] = false;
                
                try {
                    await this.replaceBrowser(i);
                    this.browserHealth[i] = true; // Mark as healthy after successful replacement
                    replacedCount++;
                    console.log(`✅ [HEALTH] Browser ${i + 1} successfully replaced and reconnected.`);
                } catch (error: any) {
                    console.error(`❌ [HEALTH] Failed to replace browser ${i + 1}: ${error.message}`);
                }
            } else if (isConnected && !this.browserHealth[i]) { // Was unhealthy, now it's back
                 this.browserHealth[i] = true;
                 console.log(`✅ [HEALTH] Browser ${i + 1} has reconnected.`);
            }
        }

        if (replacedCount > 0) {
            console.log(`✅ [HEALTH] Replaced ${replacedCount} crashed browser(s).`);
        } else {
            console.log('✅ [HEALTH] All browsers are connected.');
        }
        this.logMemoryUsage();
    }

    /**
     * Replaces a crashed browser instance.
     */
    private async replaceBrowser(index: number): Promise<void> {
        // Ensure the old browser is fully gone
        if (this.browsers[index]) {
            try {
                await this.browsers[index].close();
            } catch (e) { /* Ignore errors, it's likely already dead */ }
        }

        // Relaunch the browser
        this.browsers[index] = await this.launchBrowser(index);

        // Reset tab count for this browser
        this.browserTabCounts[index] = 0;

        // Find all tabs that were running on the crashed browser and reopen them
        const tabsToReopen: Array<{ eventId: string; event: any; url: string; sportSlug: string }> = [];
        for (const [eventId, tabInfo] of this.eventTabs.entries()) {
            if (tabInfo.browserIndex === index) {
                console.log(`    - Event ${eventId} was on crashed browser ${index + 1}. Queueing for reopening...`);
                tabsToReopen.push({ 
                    eventId, 
                    event: tabInfo.event, 
                    url: tabInfo.url,
                    sportSlug: tabInfo.sportSlug
                });
                // Remove old tab info
                this.eventTabs.delete(eventId);
                this.eventDataCache.delete(eventId);
            }
        }
        
        // Reopen tabs on the new browser
        if (tabsToReopen.length > 0) {
            console.log(`    - Reopening ${tabsToReopen.length} tabs on new browser ${index + 1}...`);
            for (const { event, url } of tabsToReopen) {
                try {
                    await this.openEventTab(event, url);
                    console.log(`      ✅ Reopened event ${event.id}`);
                } catch (error: any) {
                    console.error(`      ❌ Failed to reopen event ${event.id}: ${error.message}`);
                }
            }
            console.log(`    - Browser ${index + 1} recovery complete. ${tabsToReopen.length} tabs reopened.`);
        } else {
            console.log(`    - The new browser ${index + 1} is ready. New events will be assigned to it.`);
        }
    }

    /**
     * Log memory usage
     */
    private logMemoryUsage(): void {
        const used = process.memoryUsage();
        const rss = Math.round(used.rss / 1024 / 1024);
        const heapUsed = Math.round(used.heapUsed / 1024 / 1024);
        const heapTotal = Math.round(used.heapTotal / 1024 / 1024);
        const external = Math.round(used.external / 1024 / 1024);
        
        console.log(`📊 [MEMORY] RSS: ${rss}MB | Heap: ${heapUsed}/${heapTotal}MB | External: ${external}MB`);
    }
    
    /**
     * Get active tabs count
     */
    getActiveTabsCount(): number {
        return this.eventTabs.size;
    }
    
    /**
     * Get capacity info
     */
    getCapacityInfo(): { active: number; max: number | string; browsers: number } {
        return {
            active: this.eventTabs.size,
            max: this.MAX_TOTAL_EVENTS === 0 ? 'unlimited' : this.MAX_TOTAL_EVENTS,
            browsers: this.BROWSERS_COUNT
        };
    }
}
