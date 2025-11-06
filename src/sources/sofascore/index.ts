import { Browser } from 'puppeteer';
import { CombinedData, StandardizedEvent, LiveEvent, Sport } from '../../common/commonTypes';
import { IDataSource } from '../IDataSource';
import { SofaScoreAPI } from './SofaScoreAPI';
import { transformSofaScoreEvent } from './dataTransformer';

export class SofaScoreDataSource implements IDataSource {
    name = 'sofascore';
    private api: SofaScoreAPI;
    private lastFetchTime = 0;
    private lastSuccessfulData: CombinedData | null = null;
    private isFetching = false;
    private static FETCH_COOLDOWN = 60000; // 60 seconds between fetch starts

    constructor(browser: Browser | null) {
        if (!browser) {
            throw new Error('SofaScore data source requires a browser instance');
        }
        this.api = new SofaScoreAPI(browser);
    }

    /**
     * Background scraping function - updates cache when complete
     * This runs asynchronously and doesn't block the main fetch cycle
     */
    private async scrapeInBackground(): Promise<void> {
        console.log('🚀 [SOFASCORE BACKGROUND] Starting full scraping in background...');
        try {
            const result = await this.api.getAllLiveSportsData();
            
            if (!result || !result.sofascoreData) {
                console.warn(`⚠️ [SOFASCORE BACKGROUND] Scraping returned no data`);
                return;
            }

            // Transform and build combined data
            const standardizedEvents: StandardizedEvent[] = Object.entries(result.sofascoreData.events)
                .map(([eventId, eventData]) => transformSofaScoreEvent(eventId, eventData))
                .filter((event): event is StandardizedEvent => event !== null);

            const sports: Sport[] = Object.values(result.sofascoreData.sports).map((sport: any): Sport => ({
                key: sport.slug,
                group: 'sofascore',
                title: sport.name,
                description: `Live events from SofaScore for ${sport.name}`,
                active: true,
                has_outrights: false
            }));

            const liveEvents: LiveEvent[] = standardizedEvents.map((event: StandardizedEvent): LiveEvent => ({
                id: event.eventId,
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
                sofascore: result.sofascoreData
            };
            
            // Update cache atomically
            this.lastSuccessfulData = combinedData;
            this.isFetching = false;
            
            console.log(`✅ [SOFASCORE BACKGROUND] Scraping complete! Updated cache with ${sports.length} sports, ${standardizedEvents.length} events`);
            console.log(`✅ [SOFASCORE BACKGROUND] Cache now contains: ${Object.keys(result.sofascoreData.events || {}).length} raw events`);
            
        } catch (error) {
            console.error(`❌ [SOFASCORE BACKGROUND] Error during scraping:`, error);
            this.isFetching = false;
        }
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
