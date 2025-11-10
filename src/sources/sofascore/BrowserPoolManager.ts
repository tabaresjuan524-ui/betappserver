import puppeteer from 'puppeteer-core';
const { chrome } = require('chrome-paths');
import { Browser, Page } from 'puppeteer-core';



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
    private eventTabs: Map<string, { browser: Browser; page: Page; browserIndex: number }> = new Map();
    private eventDataCache: Map<string, EventApiData> = new Map();
    
    private readonly BROWSERS_COUNT = 5; // Number of browser instances (each ~2GB)
    private readonly TABS_PER_BROWSER = 0; // Max tabs per browser (0 = unlimited)
    private readonly MAX_TOTAL_EVENTS = 0; // Total capacity: 0 = unlimited, or set limit (e.g., 100)
    
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
     * Launch a single browser instance
     */
    private async launchBrowser(index: number): Promise<Browser> {
        console.log(`   🚀 Launching browser ${index + 1}/${this.BROWSERS_COUNT}...`);
        
        try {
            const browser = await puppeteer.launch({
                executablePath: chrome,
                headless: true, // Use true for production, false for debugging
                protocolTimeout: 90000, // 90 seconds, crucial for handling high load
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
                    `--window-size=1280,720`,
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
            await page.goto('about:blank', { waitUntil: 'domcontentloaded' });

            // 2. Set up everything before navigating to the heavy page
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setRequestInterception(true);

            page.on('request', (request: any) => {
                if (request.isInterceptResolutionHandled()) return;
                request.continue();
            });

            // Set up response listener for continuous capture
            page.on('response', async (response: any) => {
                const url = response.url();
                
                if (url.includes('www.sofascore.com/api/v1/')) {
                    try {
                        const contentType = response.headers()['content-type'] || '';
                        if (contentType.includes('application/json')) {
                            const data = await response.json();
                            
                            const endpointMatch = url.match(/api\/v1\/(.+?)(?:\?|$)/);
                            if (endpointMatch) {
                                const endpoint = endpointMatch[1];
                                
                                // Filter out noise endpoints
                                if (endpoint.includes('country/alpha2') || 
                                    endpoint.includes('branding/providers/') ||
                                    endpoint.includes('sport/-18000/event-count')) {
                                    return;
                                }
                                
                                // Update cache
                                const cachedData = this.eventDataCache.get(eventId) || {};
                                cachedData[endpoint] = data;
                                this.eventDataCache.set(eventId, cachedData);
                                
                                // Do not log here to avoid spamming logs
                                // console.log(`📥 [Browser ${browserIndex + 1}] Event ${eventId} - Captured: ${endpoint}`);
                            }
                        }
                    } catch (error) {
                        // Ignore JSON parse errors
                    }
                }
            });

            // Track tab here, before navigation, to allow for cleanup on failure
            this.eventTabs.set(eventId, { browser, page, browserIndex });
            this.browserTabCounts[browserIndex]++;
            this.eventDataCache.set(eventId, interceptedData);

            console.log(`🌐 [Browser ${browserIndex + 1}] Event ${eventId} - ${event.slug}`);
            console.log(`   URL: ${eventUrl}`);
            
            // 3. Now, navigate to the actual URL
            await page.goto(eventUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 60000, // 60-second navigation timeout
            });
            
            console.log(`✅ [Browser ${browserIndex + 1}] Event ${eventId} - Monitoring live`);
            
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
        
        return this.getEventData(eventId);
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
            
            if (!isConnected && this.browserHealth[i]) { // Was healthy, now it's not
                console.warn(`⚠️ [HEALTH] Browser ${i + 1} is disconnected. Attempting to replace...`);
                this.browserHealth[i] = false;
                
                try {
                    await this.replaceBrowser(i);
                    replacedCount++;
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

        // Find all tabs that were running on the crashed browser
        const tabsToReopen: { event: any, url: string }[] = [];
        for (const [eventId, tabInfo] of this.eventTabs.entries()) {
            if (tabInfo.browserIndex === index) {
                // We need event and url to reopen. This assumes you store them somewhere.
                // For this example, we'll need to enhance what we store in eventTabs or have a way to retrieve it.
                // Let's assume we can't get the event object back easily, so we just log it.
                console.warn(`    - Event ${eventId} was on crashed browser ${index + 1}. It needs to be reopened.`);
                this.eventTabs.delete(eventId);
                this.eventDataCache.delete(eventId);
            }
        }
        
        // Note: Re-opening tabs automatically is complex as you need the original `event` object.
        // A robust implementation would involve a persistent queue or re-fetching the event list.
        // For now, the system will self-heal by creating a new browser, and subsequent fetch cycles will fill it.
        console.log(`    - The new browser ${index + 1} is ready. New events will be assigned to it.`);
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
