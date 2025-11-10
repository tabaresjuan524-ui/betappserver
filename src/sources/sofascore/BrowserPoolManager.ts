import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';

puppeteer.use(StealthPlugin());

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
    
    constructor() {
        this.browserTabCounts = new Array(this.BROWSERS_COUNT).fill(0);
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
        
        this.logMemoryUsage();
    }
    
    /**
     * Launch a single browser instance
     */
    private async launchBrowser(index: number): Promise<Browser> {
        console.log(`   🚀 Launching browser ${index + 1}/${this.BROWSERS_COUNT}...`);
        
        return await puppeteer.launch({
            headless: true, // Use true for production, false for debugging
            protocolTimeout: 90000, // Increased timeout for stealth plugin (90 seconds)
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
    }
    
    /**
     * Get the browser with least tabs
     */
    private getLeastLoadedBrowserIndex(): number {
        let minIndex = 0;
        let minCount = this.browserTabCounts[0];
        
        for (let i = 1; i < this.browserTabCounts.length; i++) {
            if (this.browserTabCounts[i] < minCount) {
                minCount = this.browserTabCounts[i];
                minIndex = i;
            }
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
        
        try {
            const page = await browser.newPage();
            
            // Set user agent
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // Enable request interception
            await page.setRequestInterception(true);
            
            page.on('request', (request: any) => {
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
                                
                                // Store in both interceptedData and cache for continuous updates
                                interceptedData[endpoint] = data;
                                
                                // Update cache
                                const cachedData = this.eventDataCache.get(eventId) || {};
                                cachedData[endpoint] = data;
                                this.eventDataCache.set(eventId, cachedData);
                                
                                console.log(`📥 [Browser ${browserIndex + 1}] Event ${eventId} - Captured: ${endpoint}`);
                            }
                        }
                    } catch (error) {
                        // Ignore JSON parse errors
                    }
                }
            });
            
            console.log(`🌐 [Browser ${browserIndex + 1}] Event ${eventId} - ${event.slug}`);
            console.log(`   URL: ${eventUrl}`);
            
            // Navigate
            await page.goto(eventUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000, // Increased navigation timeout
            });
            
            console.log(`✅ [Browser ${browserIndex + 1}] Event ${eventId} - Monitoring live (tab stays open)`);
            
            // Track this tab
            this.eventTabs.set(eventId, { browser, page, browserIndex });
            this.browserTabCounts[browserIndex]++;
            this.eventDataCache.set(eventId, interceptedData);
            
            // Log distribution periodically
            const totalActiveTabs = this.eventTabs.size;
            if (totalActiveTabs % 10 === 0) {
                this.logDistribution();
            }
            
        } catch (error: any) {
            console.error(`❌ [Browser ${browserIndex + 1}] Event ${eventId}: ${error.message}`);
            console.error(`   URL: ${eventUrl}`);
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
        
        console.log('✅ [BROWSER POOL] Cleanup complete');
    }
    
    /**
     * Log browser load distribution
     */
    private logDistribution(): void {
        console.log(`📊 [BROWSER POOL] Distribution: ${this.browserTabCounts.map((count, i) => `B${i + 1}:${count}`).join(' | ')} (Total: ${this.eventTabs.size})`);
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
