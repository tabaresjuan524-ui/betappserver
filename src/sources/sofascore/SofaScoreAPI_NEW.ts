import { Browser } from 'puppeteer';
import { Sport, SportEvent, EventDetails } from './types';
import { SofaSport } from '../../common/commonTypes';

const BASE_URL = 'https://www.sofascore.com/api/v1';
const IMG_BASE_URL = 'https://img.sofascore.com/api/v1';

export class SofaScoreAPI {
    private browser: Browser;
    private sessionEstablished: boolean = false;
    private sharedPage: any = null;

    constructor(browser: Browser) {
        this.browser = browser;
    }

    private async establishSession(): Promise<any> {
        if (this.sessionEstablished && this.sharedPage) {
            console.log(`[SofaScore] ✅ Session already established, reusing...`);
            return this.sharedPage;
        }

        console.log(`[SofaScore] 🔄 Establishing new headless session...`);
        this.sharedPage = await this.browser.newPage();
        await this.sharedPage.setCacheEnabled(false);
        
        // Set headers that match a real browser request
        await this.sharedPage.setExtraHTTPHeaders({
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.sofascore.com/',
            'Origin': 'https://www.sofascore.com',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin'
        });

        // First visit the main SofaScore website to establish session and pass challenge
        console.log(`[SofaScore] First visiting main site to establish session...`);
        await this.sharedPage.goto('https://www.sofascore.com/', { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000
        });
        
        // Wait a moment for any challenge/auth mechanisms to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Debug: Log all cookies after session establishment
        const cookies = await this.sharedPage.cookies();
        console.log(`[SofaScore] 🍪 Session cookies set: ${cookies.length} cookies`);
        cookies.forEach((cookie: any) => console.log(`   - ${cookie.name}: ${cookie.value.substring(0, 20)}...`));
        
        // Debug: Log current page info
        console.log(`[SofaScore] 📄 Session page title: "${await this.sharedPage.title()}"`);
        console.log(`[SofaScore] 🔗 Session URL: ${this.sharedPage.url()}`);
        
        this.sessionEstablished = true;
        console.log(`[SofaScore] ✅ Session established successfully`);
        return this.sharedPage;
    }

    private async get<T>(endpoint: string, useCacheBuster: boolean = false): Promise<T | null> {
        const url = `${BASE_URL}${endpoint}`;
        const page = await this.establishSession();

        try {
            console.log(`[SofaScore] Making API request: ${url}`);
            const response = await page.goto(url, { waitUntil: 'networkidle0' });

            if (response && response.ok()) {
                const responseText = await response.text();
                try {
                    const jsonResponse = JSON.parse(responseText);
                    console.log(`✅ [SOFASCORE SUCCESS] ${url} - Status: ${response.status()}`);
                    return jsonResponse as T;
                } catch (responseParseError) {
                    const bodyText = await page.evaluate(() => document.body.innerText);
                    try {
                        const jsonResponse = JSON.parse(bodyText);
                        console.log(`✅ [SOFASCORE SUCCESS] ${url} - Status: ${response.status()} (from body)`);
                        return jsonResponse as T;
                    } catch (bodyParseError) {
                        console.error(`🚨 [SOFASCORE MANUAL TEST NEEDED] Failed to parse JSON: ${url}`);
                        return null;
                    }
                }
            } else {
                console.error(`🚨 [SOFASCORE DEBUG] Failed endpoint: ${url}`);
                return null;
            }
        } catch (error) {
            console.error(`🚨 [SOFASCORE MANUAL TEST NEEDED] Exception on endpoint: ${url}`);
            console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    // 🎯 MAIN METHOD - Get live events from ALL sports with WebSocket support
    async getAllLiveSportsData(): Promise<{ sofascoreData: any }> {
        console.log(`\n🌍 =================== ALL LIVE SPORTS DATA COLLECTION ===================`);
        console.log(`🎯 Processing ALL sports: API → Sport Pages → En Vivo → All Events`);
        console.log(`================================================================\n`);

        const page = await this.establishSession();
        const interceptedData = new Map<string, any>();
        
        // Set up network interception
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
                } catch (error) {
                    // Skip non-JSON responses
                }
            }
        });

        // Step 1: Get sports with live events from API
        console.log(`🔵 Step 1: Getting ALL sports with live events from API`);
        const timestamp = Date.now();
        const eventCountUrl = `https://www.sofascore.com/api/v1/sport/-18000/event-count?_=${timestamp}`;
        
        await page.goto(eventCountUrl, { 
            waitUntil: 'networkidle0',
            timeout: 60000 
        });

        // Extract the event count data
        const sportsWithLiveEvents = await page.evaluate(() => {
            try {
                const bodyText = document.body.innerText;
                const sportsData = JSON.parse(bodyText);
                console.log('🎯 Event count data:', Object.keys(sportsData));
                
                const liveSports: any[] = [];
                for (const [sportSlug, counts] of Object.entries(sportsData)) {
                    const sportCounts = counts as { live: number; total: number };
                    if (sportCounts.live > 0) {
                        liveSports.push({
                            slug: sportSlug,
                            liveCount: sportCounts.live,
                            // Special handling for football (it goes to homepage)
                            url: sportSlug === 'football' ? 'https://www.sofascore.com/es/' : `https://www.sofascore.com/es/${sportSlug}`
                        });
                    }
                }
                
                console.log(`✅ Found ${liveSports.length} sports with live events`);
                return liveSports;
            } catch (error) {
                console.error('❌ Error parsing event count data:', error);
                return [];
            }
        });

        if (sportsWithLiveEvents.length === 0) {
            console.error(`❌ No sports with live events found`);
            return { sofascoreData: { events: {}, teams: {}, tournaments: {}, media: {}, sports: {} } };
        }

        console.log(`✅ Sports with live events:`, sportsWithLiveEvents.map((s: any) => `${s.slug} (${s.liveCount})`));

        // Step 2: Process ALL sports with live events
        const sofascoreData: any = {
            events: {},
            teams: {},
            tournaments: {},
            media: {},
            sports: {},
            summary: {
                totalSports: 0,
                totalEvents: 0,
                totalApiCalls: 0,
                processedAt: new Date().toISOString()
            }
        };

        console.log(`\n🔵 Step 2: Processing ALL sports with live events (${sportsWithLiveEvents.length} sports)`);
        
        // Process all sports
        for (let sportIndex = 0; sportIndex < sportsWithLiveEvents.length; sportIndex++) {
            const sport = sportsWithLiveEvents[sportIndex];
            console.log(`\n🏈 Processing Sport ${sportIndex + 1}/${sportsWithLiveEvents.length}: ${sport.slug} (${sport.liveCount} live events)`);
            
            try {
                await page.goto(sport.url, {
                    waitUntil: 'networkidle0',
                    timeout: 45000
                });

                // Click "En Vivo" button for each sport
                try {
                    const enVivoClicked = await page.evaluate(() => {
                        const allButtons = Array.from(document.querySelectorAll('button'));
                        for (const button of allButtons) {
                            if (button.textContent?.includes('En Vivo') || button.textContent?.includes('Live')) {
                                button.click();
                                return true;
                            }
                        }
                        return false;
                    });

                    if (enVivoClicked) {
                        console.log(`✅ En Vivo clicked for ${sport.slug}`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                } catch (error) {
                    console.log(`⚠️ En Vivo button handling for ${sport.slug}: continuing`);
                }

                // Extract event URLs for this sport
                const eventUrls = await page.evaluate((sportSlug: string) => {
                    const eventContainers = Array.from(document.querySelectorAll('.Box.klGMtt'));
                    const events: any[] = [];
                    
                    eventContainers.forEach((container) => {
                        const linkElement = container.querySelector('a[data-id][href]') as HTMLAnchorElement;
                        if (linkElement) {
                            const eventId = linkElement.getAttribute('data-id');
                            const href = linkElement.getAttribute('href');
                            
                            if (eventId && href) {
                                const fullUrl = href.startsWith('http') ? href : `https://www.sofascore.com${href}`;
                                events.push({ id: eventId, url: fullUrl, href: href });
                            }
                        }
                    });
                    
                    // Alternative selector fallback
                    if (events.length === 0) {
                        const alternativeElements = Array.from(document.querySelectorAll('a[data-id][href*="/match/"]'));
                        alternativeElements.forEach((element) => {
                            const eventId = element.getAttribute('data-id');
                            const href = element.getAttribute('href');
                            if (eventId && href) {
                                const fullUrl = href.startsWith('http') ? href : `https://www.sofascore.com${href}`;
                                events.push({ id: eventId, url: fullUrl, href: href });
                            }
                        });
                    }
                    
                    // Limit to 2 events per sport to manage processing time
                    return events.slice(0, 2);
                }, sport.slug);

                if (eventUrls.length === 0) {
                    console.log(`⚠️ No events found for ${sport.slug}`);
                    continue;
                }

                console.log(`✅ Found ${eventUrls.length} events for ${sport.slug}`);

                // Store sport info
                sofascoreData.sports[sport.slug] = {
                    name: sport.slug.charAt(0).toUpperCase() + sport.slug.slice(1).replace('-', ' '),
                    slug: sport.slug,
                    liveCount: sport.liveCount,
                    eventsProcessed: eventUrls.length
                };

                // Process events for this sport
                for (const eventInfo of eventUrls) {
                    console.log(`🔵 Processing ${sport.slug} event ${eventInfo.id}`);
                    
                    try {
                        interceptedData.clear();
                        
                        await page.goto(eventInfo.url, {
                            waitUntil: 'networkidle0',
                            timeout: 30000
                        });

                        await new Promise(resolve => setTimeout(resolve, 2000));

                        // Process intercepted data
                        const eventData: any = {
                            id: eventInfo.id,
                            url: eventInfo.url,
                            sport: sport.slug,
                            apiData: {},
                            media: {}
                        };

                        let apiCallCount = 0;
                        for (const [url, data] of interceptedData.entries()) {
                            apiCallCount++;
                            
                            // Categorize API responses
                            if (url.includes(`/event/${eventInfo.id}`)) {
                                if (url.includes('/statistics')) eventData.apiData.statistics = data;
                                else if (url.includes('/incidents')) eventData.apiData.incidents = data;
                                else if (url.includes('/lineups')) eventData.apiData.lineups = data;
                                else if (url.includes('/odds')) eventData.apiData.odds = data;
                                else if (url.includes('/h2h')) eventData.apiData.h2h = data;
                                else if (url.includes('/best-players')) eventData.apiData.bestPlayers = data;
                                else if (url.includes('/highlights')) eventData.apiData.highlights = data;
                                else if (url.includes('/graph')) eventData.apiData.graph = data;
                                else if (url.includes('/managers')) eventData.apiData.managers = data;
                                else if (url.includes('/pregame-form')) eventData.apiData.pregameForm = data;
                                else if (url.endsWith(`/event/${eventInfo.id}`)) eventData.apiData.eventDetails = data;
                            } else {
                                const urlParts = url.split('/');
                                const endpoint = urlParts.slice(-2).join('/');
                                eventData.apiData[endpoint] = data;
                            }
                        }

                        // Generate media URLs
                        const eventDetails = eventData.apiData.eventDetails;
                        if (eventDetails?.event) {
                            const event = eventDetails.event;
                            const homeTeamId = event.homeTeam?.id;
                            const awayTeamId = event.awayTeam?.id;
                            const tournamentId = event.tournament?.uniqueTournament?.id;

                            eventData.media = {
                                teamImages: {
                                    home: homeTeamId ? this.getTeamImageUrl(homeTeamId) : null,
                                    away: awayTeamId ? this.getTeamImageUrl(awayTeamId) : null
                                },
                                tournamentImage: tournamentId ? this.getTournamentImageUrl(tournamentId) : null,
                                playerJerseys: {
                                    home: this.getPlayerJerseyUrl(parseInt(eventInfo.id), 'home'),
                                    away: this.getPlayerJerseyUrl(parseInt(eventInfo.id), 'away')
                                }
                            };

                            // Store team and tournament data
                            if (homeTeamId && !sofascoreData.teams[homeTeamId]) {
                                sofascoreData.teams[homeTeamId] = {
                                    id: homeTeamId, name: event.homeTeam?.name, sport: sport.slug,
                                    imageUrl: this.getTeamImageUrl(homeTeamId)
                                };
                            }
                            if (awayTeamId && !sofascoreData.teams[awayTeamId]) {
                                sofascoreData.teams[awayTeamId] = {
                                    id: awayTeamId, name: event.awayTeam?.name, sport: sport.slug,
                                    imageUrl: this.getTeamImageUrl(awayTeamId)
                                };
                            }
                            if (tournamentId && !sofascoreData.tournaments[tournamentId]) {
                                sofascoreData.tournaments[tournamentId] = {
                                    id: tournamentId, name: event.tournament?.uniqueTournament?.name, sport: sport.slug,
                                    imageUrl: this.getTournamentImageUrl(tournamentId)
                                };
                            }
                        }

                        console.log(`✅ ${sport.slug} event ${eventInfo.id}: ${apiCallCount} API calls`);
                        sofascoreData.events[eventInfo.id] = eventData;
                        
                    } catch (eventError) {
                        console.error(`❌ Error processing event ${eventInfo.id}:`, eventError instanceof Error ? eventError.message : eventError);
                    }
                }
                
            } catch (sportError) {
                console.error(`❌ Error processing sport ${sport.slug}:`, sportError instanceof Error ? sportError.message : sportError);
            }
        }

        // Update summary
        sofascoreData.summary.totalSports = Object.keys(sofascoreData.sports).length;
        sofascoreData.summary.totalEvents = Object.keys(sofascoreData.events).length;
        sofascoreData.summary.totalApiCalls = Object.values(sofascoreData.events).reduce((total: number, event: any) => total + Object.keys(event.apiData).length, 0);

        console.log(`\n🌍 ================= ALL LIVE SPORTS DATA COLLECTION COMPLETED ===================`);
        console.log(`📊 FINAL SUMMARY:`);
        console.log(`   🏈 Sports processed: ${sofascoreData.summary.totalSports}`);
        console.log(`   🎯 Events processed: ${sofascoreData.summary.totalEvents}`);
        console.log(`   👥 Teams collected: ${Object.keys(sofascoreData.teams).length}`);
        console.log(`   🏆 Tournaments collected: ${Object.keys(sofascoreData.tournaments).length}`);
        console.log(`   📡 Total API interceptions: ${sofascoreData.summary.totalApiCalls}`);
        console.log(`\n🎉 COMPREHENSIVE MULTI-SPORT DATA READY FOR WEBSOCKET TRANSMISSION!`);
        console.log(`================================================================\n`);
        
        return { sofascoreData };
    }

    // Legacy methods
    async getLiveSports(): Promise<SofaSport[]> {
        console.log(`\n📋 [SOFASCORE] Getting live sports using new approach...`);
        const data = await this.getAllLiveSportsData();
        
        return Object.values(data.sofascoreData.sports).map((sport: any, index: number) => ({
            name: sport.name,
            slug: sport.slug,
            id: index + 1
        }));
    }

    async getLiveEvents(sportSlug: string): Promise<SportEvent[] | null> {
        const data = await this.getAllLiveSportsData();
        
        const events: SportEvent[] = [];
        Object.values(data.sofascoreData.events).forEach((eventData: any) => {
            if (eventData.sport === sportSlug && eventData.apiData.eventDetails?.event) {
                const event = eventData.apiData.eventDetails.event;
                events.push({
                    id: parseInt(eventData.id),
                    name: event.name || `${event.homeTeam?.name} vs ${event.awayTeam?.name}`,
                    slug: event.slug || `match-${eventData.id}`,
                    startTimestamp: event.startTimestamp || Date.now(),
                    homeTeam: event.homeTeam || { id: 0, name: 'Unknown' },
                    awayTeam: event.awayTeam || { id: 0, name: 'Unknown' },
                    homeScore: event.homeScore || { current: 0 },
                    awayScore: event.awayScore || { current: 0 },
                    status: event.status || { type: 'unknown' },
                    tournament: event.tournament
                });
            }
        });
        
        return events;
    }

    // Individual API methods (kept for compatibility)
    async getEventDetails(eventId: number): Promise<EventDetails | null> {
        return this.get<EventDetails>(`/event/${eventId}`, false);
    }

    async getIncidents(eventId: number): Promise<any> {
        return this.get(`/event/${eventId}/incidents`, false);
    }

    async getOdds(eventId: number): Promise<any> {
        return this.get(`/event/${eventId}/odds/1/all`, false);
    }
    
    async getFeaturedEventOdds(eventId: number): Promise<any> {
        return this.get(`/event/${eventId}/odds/1/featured`, false);
    }

    async getEventHighlights(eventId: number): Promise<any> {
        return this.get(`/event/${eventId}/highlights`, false);
    }

    async getBestPlayers(eventId: number): Promise<any> {
        return this.get(`/event/${eventId}/best-players/summary`, false);
    }

    async getPregameForm(eventId: number): Promise<any> {
        return this.get(`/event/${eventId}/pregame-form`, false);
    }

    async getH2H(eventId: number): Promise<any> {
        return this.get(`/event/${eventId}/h2h`, false);
    }

    async getManagers(eventId: number): Promise<any> {
        return this.get(`/event/${eventId}/managers`, false);
    }

    async getLineups(eventId: number): Promise<any> {
        return this.get(`/event/${eventId}/lineups`, false);
    }

    async getStatistics(eventId: number): Promise<any> {
        return this.get(`/event/${eventId}/statistics`, false);
    }

    async getComments(eventId: number): Promise<any> {
        return this.get(`/event/${eventId}/comments/es`, false);
    }

    async getGraph(eventId: number): Promise<any> {
        return this.get(`/event/${eventId}/graph`, false);
    }

    // Media URL generators
    getTeamImageUrl(teamId: number): string {
        return `${IMG_BASE_URL}/team/${teamId}/image`;
    }

    getTournamentImageUrl(tournamentId: number): string {
        return `${IMG_BASE_URL}/unique-tournament/${tournamentId}/image`;
    }

    getPlayerImageUrl(playerId: number): string {
        return `${IMG_BASE_URL}/player/${playerId}/image`;
    }

    getPlayerJerseyUrl(eventId: number, team: 'home' | 'away'): string {
        return `${IMG_BASE_URL}/event/${eventId}/jersey/${team}/player/clean`;
    }
}