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
                    console.log(`   ⏱️  [TIMING SPORT] Waiting random delay before sport page load...`);
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
                    console.log(`   ⏱️  [TIMING SPORT] Navigating to sport page: ${sport.url}`);
                    await page.goto(sport.url, { waitUntil: 'networkidle2', timeout: 60000 });
                    console.log(`   ⏱️  [TIMING SPORT] Sport page loaded successfully`);

                    try {
                        console.log(`   ⏱️  [TIMING SPORT] Attempting to click 'En Vivo' button...`);
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
                            console.log(`   ⏱️  [TIMING SPORT] Waiting 2s for live events to load...`);
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            console.log(`   ⏱️  [TIMING SPORT] Done waiting after En Vivo click`);
                        }
                    } catch (error) {
                        console.log(`⚠️ En Vivo button handling for ${sport.slug}: continuing`);
                    }

                    // Wait for event links (supporting multiple URL patterns)
                    try {
                        console.log(`   ⏱️  [TIMING SPORT] Waiting for event links to appear...`);
                        await page.waitForSelector('a[href*="/match/"], a[href*="/event/"]', { timeout: 15000 });
                        console.log(`✅ Event links appeared for ${sport.slug}`);
                    } catch (e) {
                        console.log(`⚠️ No event links found for ${sport.slug} after waiting. It's possible there are no live events.`);
                        continue; // Skip to the next sport
                    }

                    console.log(`   ⏱️  [TIMING SPORT] Extracting event URLs from page...`);
                    const eventUrls = await page.evaluate(() => {
                        function getScrollableContainer(startEl: Element | null): Element | Window {
                            let el: Element | null = startEl;
                            while (el) {
                                const style = window.getComputedStyle(el as Element);
                                const overflowY = style.overflowY;
                                if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > (el as HTMLElement).clientHeight) {
                                    return el;
                                }
                                el = el.parentElement;
                            }
                            return window; // fallback
                        }

                        function extractIdFromHref(href: string | null): string | null {
                            if (!href) return null;
                            const m = href.match(/\/(match|event)\/.*?(\d+)/);
                            return m ? m[2] : null;
                        }

                        return new Promise<any[]>(resolve => {
                            const firstLink = document.querySelector('a[href*="/match/"], a[href*="/event/"]') as HTMLAnchorElement | null;
                            const scroller = firstLink ? getScrollableContainer(firstLink) : window;

                            let attempts = 0;
                            const maxAttempts = 30;
                            let lastScrollPos = -1;
                            let lastHeight = -1;

                            const doScroll = () => {
                                if (scroller === window) {
                                    const currentHeight = document.body.scrollHeight;
                                    window.scrollTo(0, currentHeight);
                                    const currentPos = window.scrollY;
                                    if ((currentPos === lastScrollPos && currentHeight === lastHeight) || attempts >= maxAttempts) {
                                        // Collect all anchors
                                        const events: any[] = [];
                                        const seen = new Set<string>();
                                        document.querySelectorAll('a[href*="/match/"], a[href*="/event/"]').forEach(a => {
                                            const el = a as HTMLAnchorElement;
                                            const id = el.getAttribute('data-id') || extractIdFromHref(el.getAttribute('href'));
                                            const href = el.getAttribute('href');
                                            if (id && href && !seen.has(id)) {
                                                seen.add(id);
                                                const absUrl = href.startsWith('http') ? href : `https://www.sofascore.com${href}`;
                                                events.push({ id, url: absUrl });
                                            }
                                        });
                                        resolve(events);
                                        return;
                                    }
                                    lastScrollPos = currentPos;
                                    lastHeight = currentHeight;
                                } else {
                                    const se = scroller as HTMLElement;
                                    se.scrollTop = se.scrollHeight;
                                    if ((se.scrollTop === lastScrollPos && se.scrollHeight === lastHeight) || attempts >= maxAttempts) {
                                        const events: any[] = [];
                                        const seen = new Set<string>();
                                        (scroller as Element).querySelectorAll('a[href*="/match/"], a[href*="/event/"]').forEach(a => {
                                            const el = a as HTMLAnchorElement;
                                            const id = el.getAttribute('data-id') || extractIdFromHref(el.getAttribute('href'));
                                            const href = el.getAttribute('href');
                                            if (id && href && !seen.has(id)) {
                                                seen.add(id);
                                                const absUrl = href.startsWith('http') ? href : `https://www.sofascore.com${href}`;
                                                events.push({ id, url: absUrl });
                                            }
                                        });
                                        resolve(events);
                                        return;
                                    }
                                    lastScrollPos = se.scrollTop;
                                    lastHeight = se.scrollHeight;
                                }
                                attempts++;
                                setTimeout(doScroll, 250);
                            };
                            doScroll();
                        });
                    });
                    console.log(`   ⏱️  [TIMING SPORT] Event URL extraction complete`);

                    if (eventUrls.length === 0) {
                        // Fallback: try to derive events from intercepted live API payload
                        let fallbackEvents: any[] = [];
                        for (const [url, data] of interceptedData.entries()) {
                            if (url.includes('events/live')) {
                                const possibleArrays: any[] = [];
                                if (Array.isArray((data as any).events)) possibleArrays.push((data as any).events);
                                if (Array.isArray((data as any).sportEvents)) possibleArrays.push((data as any).sportEvents);
                                if (Array.isArray((data as any).event)) possibleArrays.push((data as any).event);
                                if (Array.isArray((data as any).sportEventGroups)) {
                                    // Flatten groups -> events
                                    (data as any).sportEventGroups.forEach((g: any) => {
                                        if (Array.isArray(g.events)) possibleArrays.push(g.events);
                                    });
                                }
                                for (const arr of possibleArrays) {
                                    for (const ev of arr) {
                                        const evSportSlug = ev?.sport?.slug || ev?.tournament?.sport?.slug || ev?.tournament?.category?.sport?.slug;
                                        if (evSportSlug === sport.slug && ev?.id) {
                                            fallbackEvents.push({ id: ev.id });
                                        }
                                    }
                                }
                            }
                        }
                        if (fallbackEvents.length === 0) {
                            console.log(`⚠️ No events found for ${sport.slug} (DOM + live API fallback)`);
                            continue;
                        }
                        console.log(`✅ Fallback extracted ${fallbackEvents.length} events for ${sport.slug} from live API response`);
                        // Map fallback events into structure with a placeholder URL (will use API endpoints directly)
                        const apiEventUrls = fallbackEvents.map(ev => ({ id: ev.id, url: `${BASE_URL}/event/${ev.id}` }));
                        // Replace eventUrls with fallback list
                        (eventUrls as any) = apiEventUrls;
                    }

                    console.log(`✅ Found ${eventUrls.length} events for ${sport.slug}`);
                    sofascoreData.sports[sport.slug] = { name: sport.slug.charAt(0).toUpperCase() + sport.slug.slice(1).replace('-', ' '), slug: sport.slug, liveCount: sport.liveCount, eventsProcessed: eventUrls.length };

                    // Process events sequentially with delays to avoid CDP saturation
                    // Key: Longer delays between events (4s) give CDP time to fully recover
                    for (let eventIndex = 0; eventIndex < eventUrls.length; eventIndex++) {
                        const eventInfo = eventUrls[eventIndex];
                        console.log(`🔵 Processing ${sport.slug} event ${eventIndex + 1}/${eventUrls.length}: ${eventInfo.id}`);
                        try {
                            console.log(`   ⏱️  [TIMING] Clearing intercepted data...`);
                            interceptedData.clear();
                            
                            // CRITICAL: Always wait before EVERY navigation (including first event)
                            // The sport page navigation saturates CDP, so first event needs delay too
                            console.log(`   ⏱️  [TIMING] Waiting 4s for CDP recovery before navigation...`);
                            await new Promise(resolve => setTimeout(resolve, 4000));
                            
                            console.log(`   ⏱️  [TIMING] Navigating to: ${eventInfo.url}`);
                            await page.goto(eventInfo.url, { waitUntil: 'networkidle2', timeout: 45000 });
                            console.log(`   ⏱️  [TIMING] Navigation complete, waiting 2s for API calls...`);
                            await new Promise(resolve => setTimeout(resolve, 2000));

                            console.log(`   ⏱️  [TIMING] Processing intercepted API data...`);
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

                            console.log(`   ⏱️  [TIMING] Extracting event details and building media URLs...`);
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

                            console.log(`   ⏱️  [TIMING] Storing event data and updating counters...`);
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