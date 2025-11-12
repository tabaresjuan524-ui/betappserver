import axios, { AxiosInstance } from 'axios';
import { BrowserPoolManager } from './BrowserPoolManager';
import PQueue from 'p-queue';
import { promises as fs } from 'fs';
import path from 'path';

interface EventCount {
    [sport: string]: {
        live: number;
        total: number;
    };
}

interface LiveEventData {
    events: Array<{
        id: number;
        slug: string;
        customId: string;
        tournament?: any;
        homeTeam?: any;
        awayTeam?: any;
        homeScore?: any;
        awayScore?: any;
        status?: any;
        [key: string]: any;
    }>;
}

interface EventApiData {
    [endpoint: string]: any;
}

interface ConsolidatedData {
    eventCount: EventCount;
    sports: {
        [sportName: string]: {
            liveEvents: LiveEventData;
            events: {
                [eventId: string]: EventApiData;
            };
        };
    };
    lastUpdate: string;
}

/**
 * SofaScore API Fetcher V2 - Uses Browser Pool for scalable event monitoring
 * Supports 100+ concurrent live events with multiple browser instances
 * 
 * CONFIGURATION OPTIONS:
 * ---------------------
 * 1. MAX_EVENTS_PER_SPORT: Limits number of events fetched per sport
 *    - Set to 0 for unlimited
 *    - Set to 5-10 for testing to prevent memory issues
 * 
 * 2. SPORT_FILTER: Filter which sports to fetch (useful for testing)
 *    - 'all' = Fetch all sports with live events (default)
 *    - 'football' = Only fetch football events
 *    - 'basketball' = Only fetch basketball events
 *    - 'tennis' = Only fetch tennis events
 *    - Any valid sport slug from SofaScore
 * 
 * EXAMPLES:
 * ---------
 * // Test only basketball with 5 events max:
 * MAX_EVENTS_PER_SPORT = 5
 * SPORT_FILTER = 'basketball'
 * 
 * // Fetch all sports unlimited:
 * MAX_EVENTS_PER_SPORT = 0
 * SPORT_FILTER = 'all'
 * 
 * // Test football only with 10 events:
 * MAX_EVENTS_PER_SPORT = 10
 * SPORT_FILTER = 'football'
 */
export class SofaScoreAPIFetcher {
    private baseUrl = 'https://www.sofascore.com';
    private apiUrl = 'https://www.sofascore.com/api/v1';
    private axiosInstance: AxiosInstance;
    private browserPool: BrowserPoolManager;
    private isBrowserPoolInitialized = false;
    private openTabQueue: PQueue;
    
    // Configuration: Limit events per sport to prevent Chrome crashes during testing
    private readonly MAX_EVENTS_PER_SPORT: number = 5; // Set to 5 for testing, can be changed to 0 (unlimited) later
    
    // Configuration: Sport filter for testing specific sports
    // Options: 'all' (fetch all sports), 'football', 'basketball', 'tennis', etc.
    // Example: Set to 'basketball' to only fetch basketball events
    private readonly SPORT_FILTER: string = 'basketball'; // Default: 'all' - fetch all sports

    constructor() {
        this.axiosInstance = axios.create({
            baseURL: this.apiUrl,
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
                'Referer': 'https://www.sofascore.com/es',
            }
        });
        
        this.browserPool = new BrowserPoolManager();
        this.openTabQueue = new PQueue({ concurrency: 2 }); // Reduced to 2 concurrent tabs to prevent memory exhaustion
    }

    /**
     * Initialize browser pool
     */
    private async initBrowserPool(): Promise<void> {
        if (!this.isBrowserPoolInitialized) {
            await this.browserPool.initialize();
            this.isBrowserPoolInitialized = true;
        }
    }

    /**
     * Create event URL
     */
    private createEventUrl(event: any): string {
        const sportSlug = event.tournament?.category?.sport?.slug || 'football';
        const slug = event.slug;
        const customId = event.customId;
        const id = event.id;
        
        return `${this.baseUrl}/es/${sportSlug}/match/${slug}/${customId}#id:${id}`;
    }

    /**
     * Fetch event count via browser to bypass anti-bot protection
     */
    private async fetchEventCount(): Promise<EventCount> {
        try {
            console.log('📊 [SOFASCORE] Fetching event count via browser...');
            
            // Initialize browser pool
            await this.initBrowserPool();
            
            // Get a browser from the pool
            const browser = this.browserPool['browsers'][0];
            const page = await browser.newPage();
            
            try {
                // Navigate to main page first to establish session
                await page.goto('https://www.sofascore.com/es', { 
                    waitUntil: 'networkidle2', 
                    timeout: 30000 
                });
                
                // Now fetch the API endpoint
                const response = await page.goto(`${this.apiUrl}/sport/-18000/event-count`, {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });
                
                const data = await response!.json();
                const sportsWithLive = Object.keys(data).filter(s => data[s].live > 0);
                console.log(`✅ [SOFASCORE] Event count fetched. Sports with live events: ${sportsWithLive.length}`);
                console.log(`📋 [SOFASCORE] Sports with live events: ${sportsWithLive.join(', ')}`);
                
                await page.close();
                return data;
            } catch (error) {
                await page.close();
                throw error;
            }
        } catch (error: any) {
            console.error('❌ [SOFASCORE] Error fetching event count:', error.message);
            throw error;
        }
    }

    /**
     * Fetch live events for a sport via browser to bypass anti-bot protection
     */
    private async fetchLiveEvents(sportName: string): Promise<LiveEventData> {
        try {
            console.log(`🏃 [SOFASCORE] Fetching live events for ${sportName}...`);
            
            // Get a browser from the pool
            const browser = this.browserPool['browsers'][0]; // Use any available browser
            const page = await browser.newPage();
            
            try {
                // Navigate to the live events API endpoint
                const response = await page.goto(`${this.apiUrl}/sport/${sportName}/events/live`, {
                    waitUntil: 'networkidle2',
                    timeout: 60000 // Increased timeout
                });

                if (!response) {
                    throw new Error('No response received from page.goto');
                }

                const data = await response.json();
                console.log(`✅ [SOFASCORE] ${sportName}: ${data.events?.length || 0} live events`);
                
                await page.close();
                return data;
            } catch (error) {
                await page.close();
                throw error; // Re-throw to be caught by outer catch
            }
        } catch (error: any) {
            console.error(`❌ [SOFASCORE] Error fetching live events for ${sportName}:`, error.message);
            return { events: [] };
        }
    }

    /**
     * Save individual event data to JSON file
     */
    private async saveEventDataToFile(eventId: string, eventData: EventApiData, sport: string): Promise<void> {
        try {
            // Create directory structure: sofascore/events/{sport}/
            const dirPath = path.join(process.cwd(), 'sofascore', 'events', sport);
            await fs.mkdir(dirPath, { recursive: true });
            
            // Save event data to file
            const filePath = path.join(dirPath, `${eventId}.json`);
            await fs.writeFile(filePath, JSON.stringify(eventData, null, 2), 'utf-8');
            
            console.log(`[SOFASCORE] ✅ Saved data for event ${eventId} to sofascore/events/${sport}/${eventId}.json`);
        } catch (error: any) {
            console.error(`[SOFASCORE] ❌ Error saving data for event ${eventId}:`, error.message);
        }
    }

    /**
     * Process events for a sport - opens tabs in browser pool for continuous monitoring
     */
    private async processEventsForSport(sportName: string, liveEvents: LiveEventData): Promise<any> {
        const sportData = {
            liveEvents,
            events: {} as { [eventId: string]: EventApiData },
        };
        
        let events = liveEvents.events || [];
        
        if (events.length === 0) {
            return sportData;
        }
        
        // Apply event limit per sport to prevent Chrome crashes during testing
        if (this.MAX_EVENTS_PER_SPORT > 0 && events.length > this.MAX_EVENTS_PER_SPORT) {
            console.log(`⚠️  [SOFASCORE] Limiting ${sportName} events from ${events.length} to ${this.MAX_EVENTS_PER_SPORT} for testing`);
            events = events.slice(0, this.MAX_EVENTS_PER_SPORT);
        }
        
        console.log(`🔄 [SOFASCORE] Processing ${events.length} events for ${sportName}...`);
        
        // Initialize browser pool if not done
        await this.initBrowserPool();
        
        // Shuffle events to distribute them across browsers more evenly
        const shuffledEvents = events.sort(() => Math.random() - 0.5);

        // Add all tab opening tasks to the queue
        const promises = shuffledEvents.map((event, index) => {
            return this.openTabQueue.add(async () => {
                try {
                    // Add delay between events to prevent memory spikes and allow GC
                    if (index > 0 && index % 2 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        // Trigger GC every 5 events if available
                        if (index % 5 === 0 && global.gc) {
                            global.gc();
                            console.log(`🗑️  [SOFASCORE] GC after ${index} events`);
                        }
                    }
                    
                    const eventUrl = this.createEventUrl(event);
                    
                    // Add per-event timeout protection to prevent individual events from hanging
                    // Increased to 120 seconds to allow for page load (90s) + widget data collection (up to 35s)
                    const eventTimeout = new Promise<EventApiData>((_, reject) => {
                        setTimeout(() => reject(new Error(`Event ${event.id} processing timeout after 120 seconds`)), 120000);
                    });
                    
                    const eventData = await Promise.race([
                        this.browserPool.openEventTab(event, eventUrl),
                        eventTimeout
                    ]).catch(error => {
                        console.error(`⏰ [SOFASCORE] Event ${event.id} timeout or error:`, error.message);
                        return {} as EventApiData; // Return empty object on timeout/error to continue processing other events
                    }) as EventApiData;
                    
                    sportData.events[event.id.toString()] = eventData;
                    
                    // Save event data to file immediately after fetching
                    if (eventData && Object.keys(eventData).length > 0) {
                        await this.saveEventDataToFile(event.id.toString(), eventData, sportName);
                    }
                } catch (error: any) {
                    console.error(`❌ [SOFASCORE] Error processing event ${event.id} in queue:`, error);
                }
            });
        });

        // Wait for all queued tasks to complete
        await Promise.all(promises);
        
        const capacity = this.browserPool.getCapacityInfo();
        console.log(`✅ [SOFASCORE] ${sportName}: ${Object.keys(sportData.events).length}/${events.length} events opened`);
        console.log(`📊 [CAPACITY] ${capacity.active}/${capacity.max} tabs across ${capacity.browsers} browsers`);
        
        return sportData;
    }

    /**
     * Fetch all data - event count, live events, and open monitoring tabs
     */
    async fetchAllData(): Promise<ConsolidatedData> {
        console.log('🚀 [SOFASCORE] Starting data fetch cycle...');
        console.log(`⚙️  [SOFASCORE] Max events per sport: ${this.MAX_EVENTS_PER_SPORT === 0 ? 'unlimited' : this.MAX_EVENTS_PER_SPORT}`);
        console.log(`🎯 [SOFASCORE] Sport filter: ${this.SPORT_FILTER === 'all' ? 'all sports' : this.SPORT_FILTER}`);
        this.logMemoryUsage();
        
        try {
            // Step 1: Fetch event count
            const eventCount = await this.fetchEventCount();
            
            // Step 2: Get sports with live events
            let sportsWithLiveEvents = Object.keys(eventCount).filter(
                sport => eventCount[sport].live > 0
            );
            
            // Step 2.5: Apply sport filter if specified
            if (this.SPORT_FILTER !== 'all') {
                const originalCount = sportsWithLiveEvents.length;
                sportsWithLiveEvents = sportsWithLiveEvents.filter(
                    sport => sport.toLowerCase() === this.SPORT_FILTER.toLowerCase()
                );
                console.log(`🎯 [SOFASCORE] Sport filter applied: ${originalCount} sports -> ${sportsWithLiveEvents.length} sport(s) (${this.SPORT_FILTER})`);
                
                if (sportsWithLiveEvents.length === 0) {
                    console.warn(`⚠️  [SOFASCORE] No live events found for sport: ${this.SPORT_FILTER}`);
                }
            }
            
            // Step 3: Fetch live events and open monitoring tabs for each sport
            const consolidatedData: ConsolidatedData = {
                eventCount,
                sports: {},
                lastUpdate: new Date().toISOString(),
            };
            
            for (const sportName of sportsWithLiveEvents) {
                try {
                    const liveEvents = await this.fetchLiveEvents(sportName);
                    
                    // Add timeout protection to prevent infinite hangs - much shorter timeout
                    const timeout = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error(`Sport ${sportName} processing timeout after 30 seconds`)), 30000);
                    });
                    
                    const sportData = await Promise.race([
                        this.processEventsForSport(sportName, liveEvents),
                        timeout
                    ]);
                    
                    consolidatedData.sports[sportName] = sportData;
                } catch (error: any) {
                    console.error(`❌ [SOFASCORE] Error processing ${sportName}:`, error.message);
                    // Continue with next sport instead of failing completely
                    consolidatedData.sports[sportName] = { 
                        liveEvents: { events: [] },
                        events: {}
                    };
                }
                
                // Add 5-second delay between sports to allow memory stabilization and full GC cycle
                if (sportsWithLiveEvents.indexOf(sportName) < sportsWithLiveEvents.length - 1) {
                    console.log('⏳ [SOFASCORE] Pausing 5s before next sport...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    // Trigger garbage collection if available
                    if (global.gc) {
                        global.gc();
                        console.log('🗑️  [SOFASCORE] Manual garbage collection triggered');
                        this.logMemoryUsage();
                    }
                }
            }
            
            console.log('✅ [SOFASCORE] Data fetch cycle completed');
            this.logMemoryUsage();
            
            return consolidatedData;
            
        } catch (error: any) {
            console.error('❌ [SOFASCORE] Error during fetch cycle:', error);
            throw error;
        }
    }

    /**
     * Get live updated data from browser pool cache
     * This returns the continuously updated data from all monitored events
     */
    getLiveData(): ConsolidatedData {
        const allEventData = this.browserPool.getAllEventData();
        
        const consolidatedData: ConsolidatedData = {
            eventCount: {},
            sports: {},
            lastUpdate: new Date().toISOString(),
        };
        
        // Organize cached data by sport (you'd need to track sport info)
        for (const [eventId, eventData] of allEventData.entries()) {
            // For now, return flat structure
            // You can enhance this to organize by sport
        }
        
        return consolidatedData;
    }

    /**
     * Close specific event monitoring
     */
    async closeEvent(eventId: string): Promise<void> {
        await this.browserPool.closeEventTab(eventId);
    }

    /**
     * Cleanup - close all browsers and tabs
     */
    async cleanup(): Promise<void> {
        console.log('🧹 [SOFASCORE] Cleaning up...');
        await this.browserPool.cleanup();
        this.isBrowserPoolInitialized = false;
        console.log('✅ [SOFASCORE] Cleanup complete');
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
        const arrayBuffers = Math.round(used.arrayBuffers / 1024 / 1024);
        const totalMemoryGB = 24;
        const percentUsed = ((rss / 1024) / totalMemoryGB * 100).toFixed(1);
        
        console.log(`📊 [MEMORY FETCH-START] RSS: ${rss}MB | Heap: ${heapUsed}/${heapTotal}MB | External: ${external}MB | Arrays: ${arrayBuffers}MB | Total: ${percentUsed}% of ${totalMemoryGB}GB`);
    }
}
