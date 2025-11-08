import { Browser } from 'puppeteer';
import { CombinedData, StandardizedEvent, LiveEvent, Sport } from '../../common/commonTypes';
import { IDataSource } from '../IDataSource';
import { SofaScoreAPI } from './SofaScoreAPI';
import { transformSofaScoreEvent } from './dataTransformer';

// Memory logging utility (duplicated for visibility in this module)
function logMemoryUsage(label: string): void {
    const used = process.memoryUsage();
    const mbUsed = {
        rss: Math.round(used.rss / 1024 / 1024),
        heapTotal: Math.round(used.heapTotal / 1024 / 1024),
        heapUsed: Math.round(used.heapUsed / 1024 / 1024),
        external: Math.round(used.external / 1024 / 1024),
        arrayBuffers: Math.round(used.arrayBuffers / 1024 / 1024)
    };
    
    const totalMemGB = 24;
    const usedPercent = ((mbUsed.rss / 1024) / totalMemGB * 100).toFixed(1);
    
    console.log(`📊 [MEMORY ${label}] RSS: ${mbUsed.rss}MB | Heap: ${mbUsed.heapUsed}/${mbUsed.heapTotal}MB | External: ${mbUsed.external}MB | Arrays: ${mbUsed.arrayBuffers}MB | Total: ${usedPercent}% of ${totalMemGB}GB`);
}

export class SofaScoreDataSource implements IDataSource {
    name = 'sofascore';
    private api: SofaScoreAPI;
    private lastFetchTime = 0;
    private lastSuccessfulData: CombinedData | null = null;
    private isFetching = false;
    private browser: Browser | null;
    private static FETCH_COOLDOWN = 60000; // 60 seconds between fetch starts

    constructor(browser: Browser | null) {
        if (!browser) {
            throw new Error('SofaScore data source requires a browser instance');
        }
        this.browser = browser;
        this.api = new SofaScoreAPI(browser);
    }

    /**
     * Background scraping function - updates cache when complete
     * This runs asynchronously and doesn't block the main fetch cycle
     */
    private async scrapeInBackground(): Promise<void> {
        console.log('🚀 [SOFASCORE BACKGROUND] Starting full scraping in background...');
        logMemoryUsage('BACKGROUND-START');
        
        // Check browser health before scraping
        if (this.browser && !this.browser.connected) {
            console.error('❌ [SOFASCORE BACKGROUND] Browser disconnected! Cannot scrape.');
            console.error('❌ [SOFASCORE BACKGROUND] Please restart the application to reinitialize the browser.');
            this.isFetching = false;
            logMemoryUsage('BACKGROUND-BROWSER-DEAD');
            return;
        }
        
        try {
            // Pass a callback to send progressive updates
            const result = await this.api.getAllLiveSportsData((partialData) => {
                // Send partial data immediately as it becomes available
                this.updateCacheWithPartialData(partialData);
            });
            
            if (!result || !result.sofascoreData) {
                console.warn(`⚠️  [SOFASCORE BACKGROUND] Scraping returned no data`);
                return;
            }

            // Final update with complete data
            this.updateCacheWithData(result.sofascoreData);

        } catch (error) {
            console.error(`❌ [SOFASCORE BACKGROUND] Error during scraping:`, error);
            logMemoryUsage('BACKGROUND-ERROR');
        } finally {
            this.isFetching = false;
            logMemoryUsage('BACKGROUND-END');
        }
    }

    /**
     * Update cache with partial data (progressive updates)
     */
    private updateCacheWithPartialData(result: any): void {
        // Extract sofascoreData from wrapper
        const sofascoreData = result.sofascoreData || result;
        
        const transformedData = this.transformSofaScoreData(sofascoreData);
        
        // Update the cache
        this.lastSuccessfulData = transformedData;
        this.lastFetchTime = Date.now();
        
        const eventCount = Object.keys(sofascoreData.events || {}).length;
        const sportCount = Object.keys(sofascoreData.sports || {}).length;
        
        console.log(`📤 [SOFASCORE PARTIAL] Broadcasting partial update: ${sportCount} sports, ${eventCount} events`);
        
        // Broadcast to frontend immediately
        const { broadcastSubscriptionUpdate } = require('../../common/websocketServer');
        broadcastSubscriptionUpdate('mainData', {
            type: 'mainData',
            data: transformedData
        });
    }

    /**
     * Update cache with final complete data
     */
    private updateCacheWithData(sofascoreData: any): void {
        const transformedData = this.transformSofaScoreData(sofascoreData);
        
        // Update the cache
        this.lastSuccessfulData = transformedData;
        this.lastFetchTime = Date.now();
        
        const eventCount = Object.keys(sofascoreData.events || {}).length;
        const sportCount = Object.keys(sofascoreData.sports || {}).length;
        
        console.log(`✅ [SOFASCORE COMPLETE] Broadcasting complete data: ${sportCount} sports, ${eventCount} events`);
        
        // Broadcast final complete data to frontend
        const { broadcastSubscriptionUpdate } = require('../../common/websocketServer');
        broadcastSubscriptionUpdate('mainData', {
            type: 'mainData',
            data: transformedData
        });
    }

    /**
     * Transform raw SofaScore data into frontend-ready structure
     */
    private transformSofaScoreData(sofascoreData: any): CombinedData {
        // Import rich transformer
        const { transformToRichFormat } = require('./richDataTransformer');
        
        // Transform to rich format with nested sofascore structure
        const richData = transformToRichFormat(sofascoreData);
        
        // Transform for legacy compatibility
        const standardizedEvents: StandardizedEvent[] = Object.entries(sofascoreData.events || {})
            .map(([eventId, eventData]) => transformSofaScoreEvent(eventId, eventData))
            .filter((event): event is StandardizedEvent => event !== null);

        const sports: Sport[] = Object.values(sofascoreData.sports || {}).map((sport: any): Sport => ({
            key: sport.slug,
            group: 'sofascore',
            title: sport.name,
            description: `Live events from SofaScore for ${sport.name}`,
            active: true,
            has_outrights: false
        }));

        const liveEvents: LiveEvent[] = standardizedEvents.map((event: StandardizedEvent): LiveEvent => ({
            id: parseInt(event.eventId, 10) || 0,
            api_name: 'sofascore',
            sport_group: event.sport,
            sport_category: event.sport,
            sport_title: event.eventName,
            league_logo: null,
            home_team: event.homeTeam.name,
            away_team: event.awayTeam.name,
            markets: [],
            commence_time: new Date().toISOString(),
            scores: {
                home: event.homeTeam.score,
                away: event.awayTeam.score
            },
            bookmakers: [],
            status: event.status,
            match_time: event.matchTime.toString(),
            start_time: new Date().toISOString(),
            active: true,
            bettingActive: true,
            team1_score: isNaN(parseInt(event.homeTeam.score)) ? 0 : parseInt(event.homeTeam.score),
            team2_score: isNaN(parseInt(event.awayTeam.score)) ? 0 : parseInt(event.awayTeam.score),
            marketsCount: 0,
            liveData: event
        }));

        const combinedData: CombinedData = {
            sports,
            liveEvents,
            standardizedEvents,
            sofascore: {
                liveData: richData,  // Rich nested structure
                events: sofascoreData.events || {},  // Raw events for backward compatibility
                sports: sofascoreData.sports || {},
                tournaments: sofascoreData.tournaments || {},
                teams: sofascoreData.teams || {},
                media: sofascoreData.media || {}
            }
        };
        
        return combinedData;
    }

    async fetchData(browser: Browser | null): Promise<CombinedData | null> {
        const now = Date.now();
        const timeSinceLastFetch = now - this.lastFetchTime;
        
        // Always return cached data immediately (non-blocking)
        const hasData = this.lastSuccessfulData !== null;
        const cacheDetails = hasData ? {
            sports: this.lastSuccessfulData!.sports?.length || 0,
            liveEvents: this.lastSuccessfulData!.liveEvents?.length || 0,
            standardizedEvents: this.lastSuccessfulData!.standardizedEvents?.length || 0,
            sofascoreEvents: Object.keys(this.lastSuccessfulData!.sofascore?.events || {}).length
        } : 'NO DATA';
        
        // Check if we should start a new background scrape
        if (!this.isFetching && timeSinceLastFetch >= SofaScoreDataSource.FETCH_COOLDOWN) {
            console.log(`🔄 [SOFASCORE] Cooldown expired (${Math.floor(timeSinceLastFetch/1000)}s). Starting background scrape...`);
            this.isFetching = true;
            this.lastFetchTime = now;
            
            // Start scraping in background - don't await!
            this.scrapeInBackground().catch(err => {
                console.error(`❌ [SOFASCORE] Background scrape failed:`, err);
                this.isFetching = false;
            });
            
            console.log(`📤 [SOFASCORE] Returning cached data while scraping:`, cacheDetails);
            return this.lastSuccessfulData;
        }
        
        // Fetch already in progress or cooldown active
        if (this.isFetching) {
            console.log(`⏳ [SOFASCORE] Scraping in progress, returning cached data:`, cacheDetails);
        } else {
            const remainingTime = Math.ceil((SofaScoreDataSource.FETCH_COOLDOWN - timeSinceLastFetch) / 1000);
            console.log(`⏳ [SOFASCORE] Cooldown active (${remainingTime}s remaining), returning cached data:`, cacheDetails);
        }
        
        return this.lastSuccessfulData;
    }
}
