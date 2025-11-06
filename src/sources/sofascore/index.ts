import { Browser } from 'puppeteer';
import { CombinedData, StandardizedEvent, LiveEvent, Sport } from '../../common/commonTypes';
import { IDataSource } from '../IDataSource';
import { SofaScoreAPI } from './SofaScoreAPI';
import { transformSofaScoreEvent } from './dataTransformer';

export class SofaScoreDataSource implements IDataSource {
    name = 'sofascore';
    private api: SofaScoreAPI;
    private lastFetchTime = 0;
    private static FETCH_COOLDOWN = 30000; // 30 seconds

    constructor(browser: Browser | null) {
        if (!browser) {
            throw new Error('SofaScore data source requires a browser instance');
        }
        this.api = new SofaScoreAPI(browser);
    }

    async fetchData(browser: Browser | null): Promise<CombinedData | null> {
        const now = Date.now();
        if (now - this.lastFetchTime < SofaScoreDataSource.FETCH_COOLDOWN) {
            console.log(`⏳ [SOFASCORE] Cooldown active, skipping fetch.`);
            return null;
        }

        console.log('🚀 [SOFASCORE] Starting data fetch for all live sports...');
        this.lastFetchTime = now;

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

            return {
                sports,
                liveEvents,
                standardizedEvents,
                sofascore: result.sofascoreData
            };
        } catch (error) {
            console.error(`❌ [SOFASCORE] Error in fetchData:`, error);
            return null;
        }
    }
}
