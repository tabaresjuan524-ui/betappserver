import { Browser, Page } from 'puppeteer';

const BASE_URL = 'https://www.sofascore.com/api/v1';
const IMG_BASE_URL = 'https://img.sofascore.com/api/v1';

export class SofaScoreAPI {
    private browser: Browser;

    constructor(browser: Browser) {
        this.browser = browser;
    }

    private async createNewPage(): Promise<Page> {
        console.log(`[SofaScore] 🔄 Creating new page for scraping session...`);
        const page = await this.browser.newPage();
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

    async getAllLiveSportsData(): Promise<{ sofascoreData: any } | null> {
        console.log(`\n🌍 =================== ALL LIVE SPORTS DATA COLLECTION ===================`);
        console.log(`🎯 Processing ALL sports: API → Sport Pages → En Vivo → All Events`);
        console.log(`================================================================\n`);

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
                return { sofascoreData: { events: {}, teams: {}, tournaments: {}, media: {}, sports: {} } };
            }

            console.log(`✅ Sports with live events:`, sportsWithLiveEvents.map((s: any) => `${s.slug} (${s.liveCount})`));

            const sofascoreData: any = {
                events: {}, teams: {}, tournaments: {}, media: {}, sports: {},
                summary: { totalSports: 0, totalEvents: 0, totalApiCalls: 0, processedAt: new Date().toISOString() }
            };

            console.log(`\n🔵 Step 2: Processing ALL sports with live events (${sportsWithLiveEvents.length} sports)`);
            
            for (let sportIndex = 0; sportIndex < sportsWithLiveEvents.length; sportIndex++) {
                const sport = sportsWithLiveEvents[sportIndex];
                console.log(`\n🏈 Processing Sport ${sportIndex + 1}/${sportsWithLiveEvents.length}: ${sport.slug} (${sport.liveCount} live events)`);
                
                try {
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
                    await page.goto(sport.url, { waitUntil: 'networkidle2', timeout: 60000 });

                    try {
                        const enVivoClicked = await page.evaluate(() => {
                            const allButtons = Array.from(document.querySelectorAll('button'));
                            for (const button of allButtons) {
                                if (button.textContent?.includes('En Vivo') || button.textContent?.includes('Live')) {
                                    (button as HTMLElement).click();
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

                    const eventUrls = await page.evaluate(() => {
                        const events: any[] = [];
                        const seenIds = new Set<string>();
                        const selectors = ['.Box.klGMtt a[data-id][href]', 'a[data-id][href*="/match/"]'];
                        
                        selectors.forEach(selector => {
                            document.querySelectorAll(selector).forEach(el => {
                                const element = el as HTMLAnchorElement;
                                const eventId = element.getAttribute('data-id');
                                const href = element.getAttribute('href');
                                if (eventId && href && !seenIds.has(eventId)) {
                                    seenIds.add(eventId);
                                    events.push({ id: eventId, url: `https://www.sofascore.com${href}` });
                                }
                            });
                        });
                        return events;
                    });

                    if (eventUrls.length === 0) {
                        console.log(`⚠️ No events found for ${sport.slug}`);
                        continue;
                    }

                    console.log(`✅ Found ${eventUrls.length} events for ${sport.slug}`);
                    sofascoreData.sports[sport.slug] = { name: sport.slug.charAt(0).toUpperCase() + sport.slug.slice(1).replace('-', ' '), slug: sport.slug, liveCount: sport.liveCount, eventsProcessed: eventUrls.length };

                    for (const eventInfo of eventUrls) {
                        console.log(`🔵 Processing ${sport.slug} event ${eventInfo.id}`);
                        try {
                            interceptedData.clear();
                            await new Promise(resolve => setTimeout(resolve, Math.random() * 1500 + 500));
                            await page.goto(eventInfo.url, { waitUntil: 'networkidle2', timeout: 45000 });
                            await new Promise(resolve => setTimeout(resolve, 2000));

                            const eventData: any = { id: eventInfo.id, url: eventInfo.url, sport: sport.slug, apiData: {}, media: {} };
                            let apiCallCount = 0;

                            for (const [url, data] of interceptedData.entries()) {
                                apiCallCount++;
                                if (url.includes(`/event/${eventInfo.id}`)) {
                                    if (url.includes('/statistics')) eventData.apiData.statistics = data;
                                    else if (url.includes('/incidents')) eventData.apiData.incidents = data;
                                    else if (url.includes('/lineups')) eventData.apiData.lineups = data;
                                    else if (url.includes('/odds')) eventData.apiData.odds = data;
                                    else if (url.includes('/h2h')) eventData.apiData.h2h = data;
                                    else if (url.endsWith(`/event/${eventInfo.id}`)) eventData.apiData.eventDetails = data;
                                }
                            }

                            const eventDetails = eventData.apiData.eventDetails?.event;
                            if (eventDetails) {
                                const { homeTeam, awayTeam, tournament } = eventDetails;
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

                            console.log(`✅ ${sport.slug} event ${eventInfo.id}: ${apiCallCount} API calls`);
                            sofascoreData.events[eventInfo.id] = eventData;
                            sofascoreData.summary.totalEvents++;
                            sofascoreData.summary.totalApiCalls += apiCallCount;

                        } catch (eventError) {
                            console.error(`🚨 Error processing event ${eventInfo.id} for ${sport.slug}:`, eventError);
                        }
                    }
                } catch (sportError) {
                    console.error(`🚨 Error processing sport ${sport.slug}:`, sportError);
                }
            }

            sofascoreData.summary.totalSports = sportsWithLiveEvents.length;
            console.log(`\n✅ =================== DATA COLLECTION COMPLETE ===================`);
            console.log(`   Total Sports: ${sofascoreData.summary.totalSports}`);
            console.log(`   Total Events: ${sofascoreData.summary.totalEvents}`);
            console.log(`   Total API Calls: ${sofascoreData.summary.totalApiCalls}`);
            console.log(`================================================================\n`);

            return { sofascoreData };

        } catch (error) {
            console.error(`🚨 [SOFASCORE FATAL] A critical error occurred during the scraping process:`, error);
            return null;
        } finally {
            if (page) {
                console.log(`[SofaScore] 🔻 Closing page for scraping session...`);
                await page.close();
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