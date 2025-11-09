import { Cluster } from 'puppeteer-cluster';
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
    private lastSuccessfulData: CombinedData | null = null;
    private isFetching = false;
    private cluster: Cluster;
    private static FETCH_COOLDOWN = 60000; // 60 seconds between fetch starts

    constructor(cluster: Cluster) {
        if (!cluster) {
            throw new Error('SofaScore data source requires a cluster instance');
        }
        this.cluster = cluster;
        this.api = new SofaScoreAPI(this.cluster);
    }

    /**
     * Starts the continuous background fetching process.
     */
    public startFetching(): void {
        console.log('✅ [SOFASCORE] Starting continuous fetching loop...');
        
        const fetchTask = async () => {
            if (this.isFetching) {
                console.log('⏳ [SOFASCORE] Previous fetch still in progress. Skipping this cycle.');
                return;
            }

            console.log('🚀 [SOFASCORE] Starting new scraping cycle...');
            this.isFetching = true;
            logMemoryUsage('FETCH-START');

            try {
                // The API method will now use the cluster internally
                await this.api.getAllLiveSportsData((partialData) => {
                    this.updateCacheWithData(partialData);
                });
                
                console.log(`✅ [SOFASCORE] Scraping cycle complete!`);
                logMemoryUsage('FETCH-SUCCESS');

            } catch (error) {
                console.error(`❌ [SOFASCORE] Error during scraping cycle:`, error);
                logMemoryUsage('FETCH-ERROR');
            } finally {
                this.isFetching = false;
                if (global.gc) {
                    console.log('🧹 Triggering garbage collection...');
                    global.gc();
                    logMemoryUsage('POST-GC');
                }
            }
        };

        // Run immediately and then set an interval
        fetchTask();
        setInterval(fetchTask, SofaScoreDataSource.FETCH_COOLDOWN);
    }

    /**
     * Transform and update cache with current scraped data
     */
    private updateCacheWithData(sofascoreData: any): void {
        try {
            // Transform and build combined data
            const standardizedEvents: StandardizedEvent[] = Object.entries(sofascoreData.events)
                .map(([eventId, eventData]) => transformSofaScoreEvent(eventId, eventData))
                .filter((event): event is StandardizedEvent => event !== null);

            const sports: Sport[] = Object.values(sofascoreData.sports).map((sport: any): Sport => ({
                key: sport.slug,
                group: 'sofascore',
                title: sport.name,
                description: `Live events from SofaScore for ${sport.name}`,
                active: true,
                has_outrights: false
            }));

            const liveEvents: LiveEvent[] = standardizedEvents.map((event: StandardizedEvent): LiveEvent => ({
                id: parseInt(event.eventId, 10),
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
                sofascore: sofascoreData
            };
            
            // Update cache atomically
            this.lastSuccessfulData = combinedData;
            
            console.log(`🔄 [SOFASCORE CACHE] Updated with ${sports.length} sports, ${standardizedEvents.length} events`);
            
        } catch (error) {
            console.error(`❌ [SOFASCORE CACHE] Error updating cache:`, error);
        }
    }

    async fetchData(): Promise<CombinedData | null> {
        // This method now simply returns the latest cached data.
        // The fetching is handled by the startFetching loop.
        const hasData = this.lastSuccessfulData !== null;
        const cacheDetails = hasData ? {
            sports: this.lastSuccessfulData!.sports?.length || 0,
            liveEvents: this.lastSuccessfulData!.liveEvents?.length || 0,
            standardizedEvents: this.lastSuccessfulData!.standardizedEvents?.length || 0,
            sofascoreEvents: Object.keys(this.lastSuccessfulData!.sofascore?.events || {}).length
        } : 'NO DATA';

        if (this.isFetching) {
            console.log(`⏳ [SOFASCORE] Scraping in progress, returning cached data:`, cacheDetails);
        } else {
            console.log(`📬 [SOFASCORE] Returning cached data:`, cacheDetails);
        }
        
        return this.lastSuccessfulData;
    }
}
