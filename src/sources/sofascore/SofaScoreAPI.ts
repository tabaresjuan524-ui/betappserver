import { Browser, Page } from 'puppeteer';

const BASE_URL = 'https://www.sofascore.com/api/v1';
const IMG_BASE_URL = 'https://img.sofascore.com/api/v1';

// Memory logging utility
function logMemoryUsage(label: string): void {
    const used = process.memoryUsage();
    const mbUsed = {
        rss: Math.round(used.rss / 1024 / 1024), // Resident Set Size - total memory allocated
        heapTotal: Math.round(used.heapTotal / 1024 / 1024), // Total heap allocated
        heapUsed: Math.round(used.heapUsed / 1024 / 1024), // Heap actually used
        external: Math.round(used.external / 1024 / 1024), // C++ objects bound to JS
        arrayBuffers: Math.round(used.arrayBuffers / 1024 / 1024) // ArrayBuffers and SharedArrayBuffers
    };
    
    // Get system memory info (Windows)
    const totalMemGB = 24; // Your system has 24GB
    const usedPercent = ((mbUsed.rss / 1024) / totalMemGB * 100).toFixed(1);
    
    console.log(`📊 [MEMORY ${label}] RSS: ${mbUsed.rss}MB | Heap: ${mbUsed.heapUsed}/${mbUsed.heapTotal}MB | External: ${mbUsed.external}MB | Arrays: ${mbUsed.arrayBuffers}MB | Total: ${usedPercent}% of ${totalMemGB}GB`);
}

export class SofaScoreAPI {
    private browser: Browser;

    constructor(browser: Browser) {
        this.browser = browser;
    }

    private async createNewPage(): Promise<Page> {
        console.log(`[SofaScore] 🔄 Creating new page for scraping session...`);
        
        // Check if browser is still connected
        if (!this.browser.connected) {
            throw new Error('Browser is not connected. Browser may have crashed or been closed.');
        }
        
        const page = await this.browser.newPage();
    // Increase default timeouts to improve stability on heavy pages
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(60000);
        await page.setCacheEnabled(false);
        
        await page.setExtraHTTPHeaders({
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.sofascore.com/',
            'Origin': 'https://www.sofascore.com',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin'
        });

        console.log(`[SofaScore] First visiting main site to establish session...`);
        await page.goto('https://www.sofascore.com/', { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log(`[SofaScore] ✅ Session established for new page`);
        return page;
    }

    async getAllLiveSportsData(progressCallback?: (partialData: any) => void): Promise<{ sofascoreData: any } | null> {
        console.log(`\n🌍 =================== ALL LIVE SPORTS DATA COLLECTION ===================`);
        console.log(`🎯 Processing ALL sports: API → Live Events API → Event Details`);
        console.log(`================================================================\n`);
        
        logMemoryUsage('START');

        let page: Page | null = null;
        
        try {
            page = await this.createNewPage();
            const interceptedData = new Map<string, any>();
            
            page.on('response', async (response: any) => {
                const url = response.url();
                if (url.includes('sofascore.com/api/v1') && response.ok()) {
                    try {
                        const contentType = response.headers()['content-type'];
                        if (contentType && contentType.includes('application/json')) {
                            const data = await response.json();
                            interceptedData.set(url, data);
                            console.log(`📡 Intercepted: ${url.split('/').slice(-2).join('/')}`);
                        }
                    } catch (error) { /* Skip non-JSON responses */ }
                }
            });

            console.log(`🔵 Step 1: Getting ALL sports with live events from API`);
            const timestamp = Date.now();
            const eventCountUrl = `https://www.sofascore.com/api/v1/sport/-18000/event-count?_=${timestamp}`;
            
            await page.goto(eventCountUrl, { waitUntil: 'networkidle0', timeout: 60000 });

            const sportsWithLiveEvents = await page.evaluate(() => {
                try {
                    const bodyText = document.body.innerText;
                    const sportsData = JSON.parse(bodyText);
                    const liveSports: any[] = [];
                    for (const [sportSlug, counts] of Object.entries(sportsData)) {
                        const sportCounts = counts as { live: number; total: number };
                        if (sportCounts.live > 0) {
                            liveSports.push({
                                slug: sportSlug,
                                liveCount: sportCounts.live,
                                url: sportSlug === 'football' ? 'https://www.sofascore.com/es/' : `https://www.sofascore.com/es/${sportSlug}`
                            });
                        }
                    }
                    return liveSports;
                } catch (error) {
                    console.error('❌ Error parsing event count data:', error);
                    return [];
                }
            });

            if (sportsWithLiveEvents.length === 0) {
                console.error(`❌ No sports with live events found`);
                // 🔍 DEBUG: Log HTML when API parse fails
                console.log(`🔍 [HTML DEBUG] Failed to parse event count API. Dumping page state...`);
                const htmlSnapshot = await page.evaluate(() => {
                    return {
                        url: window.location.href,
                        title: document.title,
                        bodyText: document.body?.innerText?.substring(0, 2000) || 'NO BODY',
                        bodyHTML: document.body?.innerHTML?.substring(0, 5000) || 'NO BODY',
                        bodyLength: document.body?.innerHTML?.length || 0
                    };
                });
                console.log(`🔍 [HTML DEBUG] URL: ${htmlSnapshot.url}`);
                console.log(`🔍 [HTML DEBUG] Title: ${htmlSnapshot.title}`);
                console.log(`🔍 [HTML DEBUG] Body length: ${htmlSnapshot.bodyLength} chars`);
                console.log(`🔍 [HTML DEBUG] Body text (first 2000 chars):\n${htmlSnapshot.bodyText}`);
                console.log(`🔍 [HTML DEBUG] Body HTML (first 5000 chars):\n${htmlSnapshot.bodyHTML}`);
                return { sofascoreData: { events: {}, teams: {}, tournaments: {}, media: {}, sports: {} } };
            }

            console.log(`✅ Sports with live events:`, sportsWithLiveEvents.map((s: any) => `${s.slug} (${s.liveCount})`));

            const sofascoreData: any = {
                events: {}, teams: {}, tournaments: {}, media: {}, sports: {},
                summary: { totalSports: 0, totalEvents: 0, totalApiCalls: 0, processedAt: new Date().toISOString() }
            };

            console.log(`\n🔵 Step 2: Fetching live events directly from API for each sport (${sportsWithLiveEvents.length} sports)`);
            
            for (let sportIndex = 0; sportIndex < sportsWithLiveEvents.length; sportIndex++) {
                const sport = sportsWithLiveEvents[sportIndex];
                console.log(`\n🏈 Processing Sport ${sportIndex + 1}/${sportsWithLiveEvents.length}: ${sport.slug} (${sport.liveCount} live events)`);
                logMemoryUsage(`SPORT-START ${sport.slug}`);
                
                try {
                    // ✨ NEW API-BASED APPROACH: Direct API call to get live events for this sport
                    console.log(`   🔵 [API] Fetching live events from: /api/v1/sport/${sport.slug}/events/live`);
                    const sportLiveEventsUrl = `https://www.sofascore.com/api/v1/sport/${sport.slug}/events/live`;
                    
                    await page.goto(sportLiveEventsUrl, { waitUntil: 'networkidle0', timeout: 60000 });
                    
                    // Extract live events from API response
                    const liveEventsData = await page.evaluate(() => {
                        try {
                            const bodyText = document.body.innerText;
                            const data = JSON.parse(bodyText);
                            return data;
                        } catch (error) {
                            console.error('Error parsing live events API response:', error);
                            return null;
                        }
                    });

                    if (!liveEventsData || !liveEventsData.events) {
                        console.log(`⚠️ No live events API data found for ${sport.slug}`);
                        continue;
                    }

                    const liveEvents = liveEventsData.events;
                    console.log(`✅ Found ${liveEvents.length} live events from API for ${sport.slug} (expected ${sport.liveCount})`);
                    
                    // Convert API events to the format expected by the processing logic
                    // IMPORTANT: Keep the full event data from the live API for later use
                    const eventUrls = liveEvents.map((event: any) => ({
                        id: event.id.toString(),
                        url: `https://www.sofascore.com/event/${event.slug}/${event.id}`,
                        slug: event.slug,
                        apiEvent: event // Keep the original API event data
                    }));
                    
                    console.log(`   📊 Processing ${eventUrls.length} live events for ${sport.slug}`);
                    
                    sofascoreData.sports[sport.slug] = { 
                        name: sport.slug.charAt(0).toUpperCase() + sport.slug.slice(1).replace('-', ' '), 
                        slug: sport.slug, 
                        liveCount: sport.liveCount, 
                        eventsProcessed: eventUrls.length 
                    };

                    // Send progressive update after finding events for this sport
                    if (progressCallback) {
                        console.log(`📤 [SOFASCORE PARTIAL] Broadcasting partial update: ${Object.keys(sofascoreData.sports).length} sports, ${Object.keys(sofascoreData.events).length} events`);
                        progressCallback({ sofascoreData: JSON.parse(JSON.stringify(sofascoreData)) });
                    }

                    // Process events sequentially (1 at a time) for maximum stability
                    // CRITICAL: Even 2 concurrent pages causes VS Code to crash due to total system memory pressure
                    // Memory per process is fine (440MB), but VS Code + Node + Chrome + 2 Puppeteer pages = system overload
                    // Sequential processing is slower but guarantees completion
                    const CONCURRENT_PAGES = 1;
                    const chunks: any[][] = [];
                    for (let i = 0; i < eventUrls.length; i += CONCURRENT_PAGES) {
                        chunks.push(eventUrls.slice(i, i + CONCURRENT_PAGES));
                    }

                    console.log(`🚀 Processing ${eventUrls.length} events in ${chunks.length} parallel batches (${CONCURRENT_PAGES} at a time)`);

                    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                        const chunk = chunks[chunkIndex];
                        console.log(`� Batch ${chunkIndex + 1}/${chunks.length}: Processing ${chunk.length} events in parallel`);

                        // Process chunk events in parallel with staggered page creation
                        const chunkPromises = chunk.map(async (eventInfo: any, indexInChunk: number) => {
                            // Stagger page creation by 500ms to reduce CDP stress
                            // This prevents 3 simultaneous newPage() calls which saturate CDP
                            if (indexInChunk > 0) {
                                await new Promise(resolve => setTimeout(resolve, 500 * indexInChunk));
                            }
                            
                            // Create a dedicated page for this event
                            const eventPage = await this.createNewPage();
                            const eventInterceptedData = new Map<string, any>();

                            // Set up response interception for this page
                            eventPage.on('response', async (response: any) => {
                                const url = response.url();
                                if (url.includes('sofascore.com/api/v1') && response.ok()) {
                                    try {
                                        const contentType = response.headers()['content-type'];
                                        if (contentType && contentType.includes('application/json')) {
                                            const data = await response.json();
                                            eventInterceptedData.set(url, data);
                                        }
                                    } catch (error) { /* Skip non-JSON */ }
                                }
                            });

                            try {
                                console.log(`   🔵 [${chunkIndex + 1}.${indexInChunk + 1}] Processing ${sport.slug} event ${eventInfo.id}`);
                                
                                // Navigate to event page using dedicated page
                                await eventPage.goto(eventInfo.url, { waitUntil: 'networkidle2', timeout: 45000 });
                                
                                // Wait for API calls to complete
                                await new Promise(resolve => setTimeout(resolve, 2000));

                                // Process intercepted data and use live API event data
                                const eventData: any = { id: eventInfo.id, url: eventInfo.url, sport: sport.slug, apiData: {}, media: {} };
                                let apiCallCount = 0;
                                
                                // TRUST LIVE EVENTS API: If event comes from /events/live endpoint, it IS live
                                // No need to re-validate live status - this was causing all events to be rejected
                                let isLiveEvent = true; // Trust the live events API
                                let statusDescription = 'live (from API)';
                                
                                // Use the event data we already have from the live events API
                                const apiEvent = eventInfo.apiEvent;
                                if (apiEvent) {
                                    // Extract basic event structure from the live API data
                                    eventData.apiData.eventDetails = { event: apiEvent };
                                    statusDescription = `${apiEvent.status?.description || 'live'} (from live API)`;
                                }
                                
                                // Also collect additional data from individual page API calls
                                for (const [url, data] of eventInterceptedData.entries()) {
                                    apiCallCount++;
                                    if (url.includes(`/event/${eventInfo.id}`)) {
                                        if (url.includes('/statistics')) eventData.apiData.statistics = data;
                                        else if (url.includes('/incidents')) eventData.apiData.incidents = data;
                                        else if (url.includes('/lineups')) eventData.apiData.lineups = data;
                                        else if (url.includes('/odds')) eventData.apiData.odds = data;
                                        else if (url.includes('/h2h')) eventData.apiData.h2h = data;
                                        else if (url.endsWith(`/event/${eventInfo.id}`)) {
                                            // Merge with existing data if available
                                            if (data && data.event) {
                                                eventData.apiData.eventDetails = data;
                                                const status = data.event.status;
                                                statusDescription = `${status?.description || 'unknown'} (API: live, Page: ${status?.type || 'unknown'})`;
                                            }
                                        }
                                    }
                                }
                                
                                console.log(`   ✅ [${chunkIndex + 1}.${indexInChunk + 1}] Event ${eventInfo.id} trusted as live from API (${apiCallCount} API calls processed) - Status: ${statusDescription}`);

                                // Event is guaranteed live from API - no need to skip

                                // Extract event details and build media URLs
                                const eventDetails = eventData.apiData.eventDetails?.event;
                                if (eventDetails) {
                                    const { homeTeam, awayTeam, tournament, status, homeScore, awayScore } = eventDetails;
                                    
                                    // Set event properties directly for frontend debugging
                                    eventData.homeTeam = homeTeam;
                                    eventData.awayTeam = awayTeam;
                                    eventData.tournament = tournament;
                                    eventData.status = status;
                                    eventData.homeScore = homeScore;
                                    eventData.awayScore = awayScore;
                                    
                                    eventData.media = {
                                        teamImages: {
                                            home: homeTeam?.id ? this.getTeamImageUrl(homeTeam.id) : null,
                                            away: awayTeam?.id ? this.getTeamImageUrl(awayTeam.id) : null
                                        },
                                        tournamentImage: tournament?.uniqueTournament?.id ? this.getTournamentImageUrl(tournament.uniqueTournament.id) : null,
                                    };

                                    if (homeTeam?.id && !sofascoreData.teams[homeTeam.id]) {
                                        sofascoreData.teams[homeTeam.id] = { id: homeTeam.id, name: homeTeam.name, sport: sport.slug, imageUrl: this.getTeamImageUrl(homeTeam.id) };
                                    }
                                    if (awayTeam?.id && !sofascoreData.teams[awayTeam.id]) {
                                        sofascoreData.teams[awayTeam.id] = { id: awayTeam.id, name: awayTeam.name, sport: sport.slug, imageUrl: this.getTeamImageUrl(awayTeam.id) };
                                    }
                                    if (tournament?.uniqueTournament?.id && !sofascoreData.tournaments[tournament.uniqueTournament.id]) {
                                        sofascoreData.tournaments[tournament.uniqueTournament.id] = { id: tournament.uniqueTournament.id, name: tournament.uniqueTournament.name, sport: sport.slug, imageUrl: this.getTournamentImageUrl(tournament.uniqueTournament.id) };
                                    }
                                }

                                console.log(`   ✅ [${chunkIndex + 1}.${indexInChunk + 1}] ${sport.slug} LIVE event ${eventInfo.id}: ${apiCallCount} API calls`);
                                
                                sofascoreData.events[eventInfo.id] = eventData;
                                sofascoreData.summary.totalEvents++;
                                sofascoreData.summary.totalApiCalls += apiCallCount;

                                return { success: true, eventId: eventInfo.id };

                            } catch (eventError) {
                                console.error(`   🚨 [${chunkIndex + 1}.${indexInChunk + 1}] Error processing event ${eventInfo.id}:`, eventError);
                                return { success: false, eventId: eventInfo.id, error: eventError };
                            } finally {
                                // CRITICAL: Always close the page to free resources
                                await eventPage.close();
                            }
                        });

                        // Wait for all events in this chunk to complete
                        const results = await Promise.allSettled(chunkPromises);
                        const successful = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;
                        const failed = results.length - successful;
                        
                        console.log(`   ✅ Batch ${chunkIndex + 1}/${chunks.length} complete: ${successful} successful, ${failed} failed`);
                        logMemoryUsage(`BATCH-${chunkIndex + 1}/${chunks.length}`);
                        
                        // Force garbage collection after each batch to help with memory pressure
                        if (global.gc) {
                            global.gc();
                            console.log(`   🗑️  Garbage collection triggered`);
                        }

                        // Small delay between batches to let system breathe
                        if (chunkIndex < chunks.length - 1) {
                            console.log(`   ⏸️  Waiting 3s before next batch...`);
                            await new Promise(resolve => setTimeout(resolve, 3000)); // Increased to 3s
                        }
                    }
                    
                    // Show final results for this sport
                    const sportLiveEvents = Object.values(sofascoreData.events).filter((event: any) => event.sport === sport.slug).length;
                    console.log(`   🏁 Sport ${sport.slug} complete: ${sportLiveEvents} live events processed (expected ${sport.liveCount})`);
                    
                    logMemoryUsage(`SPORT-END ${sport.slug}`);
                } catch (sportError) {
                    console.error(`🚨 Error processing sport ${sport.slug}:`, sportError);
                    logMemoryUsage(`SPORT-ERROR ${sport.slug}`);
                }
            }

            sofascoreData.summary.totalSports = sportsWithLiveEvents.length;
            console.log(`\n✅ =================== DATA COLLECTION COMPLETE ===================`);
            console.log(`   Total Sports: ${sofascoreData.summary.totalSports}`);
            console.log(`   Total Events: ${sofascoreData.summary.totalEvents}`);
            console.log(`   Total API Calls: ${sofascoreData.summary.totalApiCalls}`);
            console.log(`================================================================\n`);
            
            logMemoryUsage('COMPLETE');

            return { sofascoreData };

        } catch (error) {
            console.error(`🚨 [SOFASCORE FATAL] A critical error occurred during the scraping process:`, error);
            logMemoryUsage('ERROR');
            return null;
        } finally {
            if (page) {
                console.log(`[SofaScore] 🔻 Closing page for scraping session...`);
                await page.close();
                logMemoryUsage('CLEANUP');
            }
        }
    }

    public getTeamImageUrl(teamId: number): string {
        return `${IMG_BASE_URL}/team/${teamId}/image`;
    }

    public getTournamentImageUrl(tournamentId: number): string {
        return `${IMG_BASE_URL}/unique-tournament/${tournamentId}/image`;
    }
}