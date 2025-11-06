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
    private static FETCH_COOLDOWN = 30000; // 30 seconds - reduced since we're processing fewer sports

    constructor(browser: Browser | null) {
        if (!browser) {
            throw new Error('SofaScore data source requires a browser instance');
        }
        this.api = new SofaScoreAPI(browser);
    }

    async fetchData(browser: Browser | null): Promise<CombinedData | null> {
        const now = Date.now();
        
        // If currently fetching, return the last successful data
        if (this.isFetching) {
            const hasData = this.lastSuccessfulData !== null;
            const eventCount = this.lastSuccessfulData?.standardizedEvents?.length || 0;
            const cacheDetails = hasData ? {
                sports: this.lastSuccessfulData!.sports?.length || 0,
                liveEvents: this.lastSuccessfulData!.liveEvents?.length || 0,
                standardizedEvents: this.lastSuccessfulData!.standardizedEvents?.length || 0,
                sofascoreEvents: Object.keys(this.lastSuccessfulData!.sofascore?.events || {}).length
            } : 'NO DATA';
            console.log(`⏳ [SOFASCORE] Fetch in progress, returning cached data:`, cacheDetails);
            return this.lastSuccessfulData;
        }
        
        // Check cooldown
        if (now - this.lastFetchTime < SofaScoreDataSource.FETCH_COOLDOWN) {
            const remainingTime = Math.ceil((SofaScoreDataSource.FETCH_COOLDOWN - (now - this.lastFetchTime)) / 1000);
            const hasData = this.lastSuccessfulData !== null;
            const cacheDetails = hasData ? {
                sports: this.lastSuccessfulData!.sports?.length || 0,
                liveEvents: this.lastSuccessfulData!.liveEvents?.length || 0,
                standardizedEvents: this.lastSuccessfulData!.standardizedEvents?.length || 0,
                sofascoreEvents: Object.keys(this.lastSuccessfulData!.sofascore?.events || {}).length
            } : 'NO DATA';
            console.log(`⏳ [SOFASCORE] Cooldown active (${remainingTime}s remaining), returning cached data:`, cacheDetails);
            return this.lastSuccessfulData;
        }

        console.log('🚀 [SOFASCORE] Starting data fetch for all live sports...');
        this.isFetching = true;

        try {
            const result = await this.api.getAllLiveSportsData();
            
            const standardizedEvents: StandardizedEvent[] = Object.entries(result.sofascoreData.events)
                .map(([eventId, eventData]) => transformSofaScoreEvent(eventId, eventData))
                .filter((event): event is StandardizedEvent => event !== null);

            console.log(`✅ [SOFASCORE] Fetch complete. Found ${standardizedEvents.length} standardized live events.`);

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
                liveData: event // Storing the full standardized event here
            }));

            const combinedData: CombinedData = {
                sports,
                liveEvents,
                standardizedEvents,
                sofascore: result.sofascoreData
            };
            
            // Update cache and timing AFTER successful fetch
            this.lastSuccessfulData = combinedData;
            this.lastFetchTime = Date.now();
            this.isFetching = false;
            
            console.log(`✅ [SOFASCORE] Data ready to send: ${sports.length} sports, ${liveEvents.length} live events, ${standardizedEvents.length} standardized events`);
            console.log(`✅ [SOFASCORE] Cached for future requests. Raw events: ${Object.keys(result.sofascoreData.events || {}).length}`);
            
            return combinedData;
        } catch (error) {
            console.error(`❌ [SOFASCORE] Error in fetchData:`, error);
            this.isFetching = false;
            return this.lastSuccessfulData; // Return cached data on error
        }
    }
}
