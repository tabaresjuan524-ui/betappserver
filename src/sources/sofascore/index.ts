import { CombinedData, StandardizedEvent, LiveEvent, Sport } from '../../common/commonTypes';
import { IDataSource } from '../IDataSource';
import { SofaScoreAPIFetcher } from './SofaScoreAPIFetcher';
import * as fs from 'fs';
import * as path from 'path';

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
    private apiFetcher: SofaScoreAPIFetcher;
    private lastSuccessfulData: any = null;
    private isFetching = false;
    private static FETCH_INTERVAL = 60000; // 60 seconds between fetches

    constructor() {
        this.apiFetcher = new SofaScoreAPIFetcher();
    }

    /**
     * Starts the continuous background fetching process.
     */
    public startFetching(): void {
        console.log('✅ [SOFASCORE] Starting continuous fetching loop (60-second intervals)...');
        
        const fetchTask = async () => {
            if (this.isFetching) {
                console.log('⏳ [SOFASCORE] Previous fetch still in progress. Skipping this cycle.');
                return;
            }

            console.log('🚀 [SOFASCORE] Starting new API fetch cycle...');
            this.isFetching = true;
            logMemoryUsage('FETCH-START');

            try {
                // Fetch all data from SofaScore API
                const consolidatedData = await this.apiFetcher.fetchAllData();
                
                // Update cache with the new data
                this.lastSuccessfulData = consolidatedData;
                
                console.log(`✅ [SOFASCORE] API fetch cycle complete!`);
                console.log(`📊 [SOFASCORE] Data summary:`, {
                    sportsWithLiveEvents: Object.keys(consolidatedData.sports).length,
                    totalEvents: Object.values(consolidatedData.sports).reduce((sum, sport: any) => sum + Object.keys(sport.events).length, 0),
                    lastUpdate: consolidatedData.lastUpdate
                });
                
                // Debug: Log sample data structure
                this.logConsolidatedDataStructure(consolidatedData);
                
                // Save to JSON file for debugging
                this.saveConsolidatedDataToFile(consolidatedData);
                
                logMemoryUsage('FETCH-SUCCESS');

            } catch (error) {
                console.error(`❌ [SOFASCORE] Error during API fetch cycle:`, error);
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
        setInterval(fetchTask, SofaScoreDataSource.FETCH_INTERVAL);
    }

    /**
     * Log the structure of consolidated data for debugging
     */
    private logConsolidatedDataStructure(data: any): void {
        console.log('\n🔍 [SOFASCORE DEBUG] ===== CONSOLIDATED DATA STRUCTURE =====');
        
        // Log eventCount
        console.log('\n📊 Event Count by Sport:');
        Object.entries(data.eventCount).forEach(([sport, counts]: [string, any]) => {
            if (counts.live > 0) {
                console.log(`  ${sport}: ${counts.live} live / ${counts.total} total`);
            }
        });
        
        // Log sports with their events
        console.log('\n🏆 Sports with Live Events:');
        Object.entries(data.sports).forEach(([sportName, sportData]: [string, any]) => {
            const eventCount = sportData.liveEvents?.events?.length || 0;
            const interceptedCount = Object.keys(sportData.events).length;
            console.log(`\n  ${sportName}:`);
            console.log(`    - Live events from API: ${eventCount}`);
            console.log(`    - Events with intercepted data: ${interceptedCount}`);
            
            // Show first event as sample
            if (interceptedCount > 0) {
                const firstEventId = Object.keys(sportData.events)[0];
                const firstEvent = sportData.events[firstEventId];
                const firstLiveEvent = sportData.liveEvents?.events?.[0];
                
                console.log(`\n    Sample Event (ID: ${firstEventId}):`);
                if (firstLiveEvent) {
                    console.log(`      - homeTeam: ${firstLiveEvent.homeTeam?.name || 'N/A'}`);
                    console.log(`      - awayTeam: ${firstLiveEvent.awayTeam?.name || 'N/A'}`);
                    console.log(`      - status: ${firstLiveEvent.status?.description || 'N/A'}`);
                    console.log(`      - score: ${firstLiveEvent.homeScore?.display || 0} - ${firstLiveEvent.awayScore?.display || 0}`);
                }
                console.log(`      - Intercepted endpoints: ${Object.keys(firstEvent).length}`);
                console.log(`      - Endpoint names: ${Object.keys(firstEvent).join(', ')}`);
            }
        });
        
        console.log('\n🔍 [SOFASCORE DEBUG] ===== END DATA STRUCTURE =====\n');
    }

    /**
     * Save consolidated data to JSON file for debugging
     */
    private saveConsolidatedDataToFile(data: any): void {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `sofascore-data-${timestamp}.json`;
            const filepath = path.join(__dirname, '../../../sofascore', filename);
            
            // Create directory if it doesn't exist
            const dir = path.dirname(filepath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // Save to file
            fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
            console.log(`💾 [SOFASCORE DEBUG] Consolidated data saved to: ${filename}`);
        } catch (error: any) {
            console.error(`❌ [SOFASCORE DEBUG] Error saving data to file:`, error.message);
        }
    }

    /**
     * Return the cached SofaScore data
     * Note: browser parameter is ignored as we manage our own browser instance
     */
    async fetchData(browser: any = null): Promise<any> {
        // This method returns the latest cached data.
        // The fetching is handled by the startFetching loop.
        const hasData = this.lastSuccessfulData !== null;
        
        if (!hasData) {
            console.log(`⏳ [SOFASCORE] No data yet, fetching in progress...`);
            return null;
        }

        const dataDetails = {
            sportsWithLiveEvents: Object.keys(this.lastSuccessfulData.sports).length,
            totalEvents: Object.values(this.lastSuccessfulData.sports).reduce((sum: number, sport: any) => sum + Object.keys(sport.events).length, 0),
            lastUpdate: this.lastSuccessfulData.lastUpdate
        };

        if (this.isFetching) {
            console.log(`⏳ [SOFASCORE] API fetch in progress, returning cached data:`, dataDetails);
        } else {
            console.log(`📬 [SOFASCORE] Returning cached data:`, dataDetails);
        }
        
        return this.lastSuccessfulData;
    }
}
