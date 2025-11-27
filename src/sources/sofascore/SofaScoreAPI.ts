import { Cluster } from 'puppeteer-cluster';
import { Page } from 'puppeteer';
import { StandardizedEvent } from '../../common/commonTypes';

// Define the structure for the data we accumulate
interface SofascoreScrapedData {
    sports: { [key: string]: any };
    events: { [key: string]: any };
}

export class SofaScoreAPI {
    private cluster: Cluster;
    private static readonly BASE_URL = 'https://www.sofascore.com/es';

    constructor(cluster: Cluster) {
        this.cluster = cluster;
    }

    public async getAllLiveSportsData(onProgressUpdate: (partialData: SofascoreScrapedData) => void): Promise<void> {
        console.log('🌐 [API] Starting to fetch all live sports data using cluster...');

        const mainPageUrl = `${SofaScoreAPI.BASE_URL}/`;
        const accumulatedData: SofascoreScrapedData = { sports: {}, events: {} };

        try {
            // Define a task handler for the cluster
            await this.cluster.task(async ({ page, data }) => {
                const { taskType, url, eventId, sport } = data;

                if (taskType === 'getSports') {
                    console.log(`[API] Visiting main page to find live sports: ${url}`);
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

                    // Wait for content to load
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    const liveSportsLinks = await page.evaluate(() => {
                        const links: { sport: string, url: string }[] = [];

                        // Try multiple selectors
                        const selectors = [
                            'a[href*="/live-scores"]',
                            'a[href*="/football/live"]',
                            'a[href*="/tennis/live"]',
                            'a[href*="/basketball/live"]',
                            'a[href*="/hockey/live"]',
                            'a[href*="/esports/live"]'
                        ];

                        selectors.forEach(selector => {
                            const elements = document.querySelectorAll(selector);
                            elements.forEach(el => {
                                const href = (el as HTMLAnchorElement).href;
                                const sportName = el.textContent?.trim() ?? 'unknown';
                                if (href && !links.some(l => l.url === href)) {
                                    // Extract sport name from URL if text is not helpful
                                    const urlMatch = href.match(/sofascore\.com\/([^\/]+)\/(live|live-scores)/);
                                    const extractedSport = urlMatch ? urlMatch[1] : sportName.toLowerCase();
                                    links.push({ sport: extractedSport, url: href });
                                }
                            });
                        });

                        return links;
                    });

                    console.log(`[API] Found ${liveSportsLinks.length} live sports categories.`);

                    // If nothing found, try the direct approach
                    if (liveSportsLinks.length === 0) {
                        console.log('[API] No sports found with selectors. Trying direct URLs...');
                        const directSports = [
                            { sport: 'futbol', url: 'https://www.sofascore.com/es/' },
                            { sport: 'tenis', url: 'https://www.sofascore.com/es/tenis' },
                            { sport: 'baloncesto', url: 'https://www.sofascore.com/es/baloncesto' },
                            { sport: 'hockey', url: 'https://www.sofascore.com/es/hockey' },
                            { sport: 'voleibol', url: 'https://www.sofascore.com/es/voleibol' },
                            { sport: 'balonmano', url: 'https://www.sofascore.com/es/balonmano' }
                        ];
                        directSports.forEach(item => {
                            liveSportsLinks.push(item);
                        });
                    }

                    return liveSportsLinks;

                } else if (taskType === 'getEvents') {
                    console.log(`[API] Visiting sport page: ${url}`);
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

                    // Wait for dynamic content to load
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    // Scroll to load more events
                    await page.evaluate(() => {
                        window.scrollTo(0, document.body.scrollHeight);
                    });
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    const eventLinks = await page.evaluate(() => {
                        const eventUrls = new Set<string>();

                        // Debug: Log all links on the page
                        const allLinks = Array.from(document.querySelectorAll('a')).map(a => a.href);
                        console.log(`[DEBUG] Total links found: ${allLinks.length}`);
                        console.log(`[DEBUG] Sample links:`, allLinks.slice(0, 10));

                        // Try multiple selectors for event links
                        const selectors = [
                            'a[href*="/event/"]',
                            'a[href*="/#/"]',
                            '[class*="event"] a',
                            '[class*="match"] a',
                            'a[href*="/partido/"]',  // Spanish version
                            'a[href*="/evento/"]'    // Spanish version
                        ];

                        selectors.forEach(selector => {
                            const elements = document.querySelectorAll(selector);
                            console.log(`[DEBUG] Selector "${selector}" found ${elements.length} elements`);
                            elements.forEach(a => {
                                const href = (a as HTMLAnchorElement).href;
                                // Only add if it contains an event ID pattern
                                if (href && (/\/event\/\d+/.test(href) || /\/partido\/\d+/.test(href) || /\/evento\/\d+/.test(href))) {
                                    eventUrls.add(href);
                                }
                            });
                        });

                        console.log(`[DEBUG] Total unique event URLs: ${eventUrls.size}`);
                        return Array.from(eventUrls);
                    });

                    console.log(`[API] Found ${eventLinks.length} events for ${sport}`);
                    return { sport, eventLinks };

                } else if (taskType === 'getEventData') {
                    await page.setRequestInterception(true);

                    // Comprehensive API endpoint collection for live statistics
                    const apiEndpoints = [
                        'event-details',  // Basic event info
                        'statistics',     // Match statistics
                        'incidents',      // Goals, cards, etc.
                        'lineups',        // Team lineups
                        'momentum',       // Match momentum/flow
                        'graph',          // Score progression
                        'commentary',     // Live commentary
                        'player-statistics', // Individual player stats
                        'head2head',      // Historical matchups
                        'form',           // Team form
                        'odds',           // Betting odds
                        'standings'       // League standings
                    ];

                    const collectedData: { [key: string]: any } = {};
                    let collectedCount = 0;

                    const dataPromise = new Promise<any>((resolve) => {
                        const timeout = setTimeout(() => {
                            console.log(`[API] Timeout reached for event ${eventId}, collected ${collectedCount}/${apiEndpoints.length} endpoints`);
                            resolve(collectedData);
                        }, 30000); // 30 seconds timeout

                        page.on('response', async (response) => {
                            const request = response.request();
                            const requestUrl = request.url();

                            console.log(`[SOFASCORE API] Intercepted a response from URL: ${requestUrl}`);

                            // Match any SofaScore API endpoint for this event
                            if (requestUrl.includes(`/api/v1/event/${eventId}`) && request.method() === 'GET') {
                                try {
                                    const json = await response.json();

                                    // Determine endpoint type from URL
                                    let endpointType = 'unknown';
                                    for (const endpoint of apiEndpoints) {
                                        if (requestUrl.includes(`/${endpoint}`)) {
                                            endpointType = endpoint;
                                            break;
                                        }
                                    }

                                    // If no specific endpoint found, extract from URL pattern
                                    if (endpointType === 'unknown') {
                                        const match = requestUrl.match(/\/event\/\d+\/([^/?&]+)/);
                                        endpointType = match ? match[1] : 'event-details';
                                    }

                                    if (endpointType === 'standings') {
                                        console.log(`[DEBUG] Intercepted standings endpoint for event ${eventId}: ${requestUrl}`);
                                    }
                                    collectedData[endpointType] = json;
                                    if (endpointType === 'standings') {
                                        console.log(`[DEBUG] Added standings data to collectedData for event ${eventId}`);
                                    }
                                    collectedCount++;
                                    console.log(`[API] Collected ${endpointType} for event ${eventId} (${collectedCount} total)`);
                                    // If we have collected enough data or key endpoints, we can resolve early
                                    if (collectedCount >= 5 || (collectedData['event-details'] && collectedData['statistics'] && collectedData['incidents'])) {
                                        clearTimeout(timeout);
                                        resolve(collectedData);
                                    }

                                } catch (error) {
                                    console.warn(`[API] Failed to parse JSON for ${requestUrl}:`, error);
                                }
                            }
                        });
                    });

                    try {
                        console.log(`[API] Processing comprehensive data for event ${eventId}...`);
                        console.log(`[API] Navigating to URL for event ${eventId}: ${url}`);
                        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

                        // Wait a bit more for all API calls to complete
                        await new Promise(resolve => setTimeout(resolve, 5000));

                        const apiData = await dataPromise;

                        if (Object.keys(apiData).length > 0) {
                            // Extract comprehensive event data for live statistics
                            const eventData = {
                                eventId,
                                sport,
                                url,
                                apiData,
                                // Extract key live data for frontend
                                liveData: this.extractLiveData(apiData, sport),
                                // Team and tournament info
                                teams: this.extractTeamInfo(apiData),
                                tournament: this.extractTournamentInfo(apiData),
                                // Media assets
                                media: this.extractMediaAssets(apiData, eventId)
                            };

                            accumulatedData.events[eventId] = eventData;
                            accumulatedData.sports[sport] = {
                                name: sport,
                                slug: sport,
                            };

                            console.log(`[API] ✅ Complete data collected for event ${eventId}: ${Object.keys(apiData).join(', ')}`);
                            onProgressUpdate(accumulatedData);
                        } else {
                            console.warn(`[API] ⚠️ No API data collected for event ${eventId}`);
                        }
                    } catch (error) {
                        console.warn(`⚠️ [CLUSTER] Failed to process event ${eventId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                }
            });

            // Step 1: Get all sports
            const liveSportsLinks = await this.cluster.execute({
                taskType: 'getSports',
                url: mainPageUrl
            });

            // Step 2: For each sport, get all events
            for (const sportLink of (liveSportsLinks || [])) {
                const result = await this.cluster.execute({
                    taskType: 'getEvents',
                    url: sportLink.url,
                    sport: sportLink.sport
                });

                // Step 3: For each event, get the data
                if (result && result.eventLinks) {
                    for (const eventUrl of result.eventLinks.slice(0, 20)) { // Limit to 20 events per sport for now
                        const match = eventUrl.match(/\/event\/(\d+)/);
                        if (match && match[1]) {
                            this.cluster.queue({
                                taskType: 'getEventData',
                                url: eventUrl,
                                eventId: match[1],
                                sport: result.sport
                            });
                        }
                    }
                }
            }

            // Wait for all queued tasks to finish
            await this.cluster.idle();
            console.log('✅ [API] All cluster tasks finished.');

        } catch (error) {
            console.error('❌ [API] Error during scraping:', error);
            throw error;
        }
    }

    /**
     * Extract live data for frontend widgets from collected API data
     */
    private extractLiveData(apiData: any, sport: string): any {
        const liveData: any = {};

        try {
            // Basic event details
            if (apiData['event-details']?.event) {
                const event = apiData['event-details'].event;
                liveData.status = event.status?.description;
                liveData.MatchTime = event.time?.currentPeriodStartTimestamp ?
                    Math.floor((Date.now() / 1000 - event.time.currentPeriodStartTimestamp) / 60) : -1;
                liveData.PeriodName = event.status?.type;

                // Scores
                if (event.homeScore?.current !== undefined) {
                    liveData.ResultHome = event.homeScore.current;
                }
                if (event.awayScore?.current !== undefined) {
                    liveData.ResultAway = event.awayScore.current;
                }

                // Period scores for different sports
                if (event.homeScore?.period1 !== undefined) {
                    const periods = [];
                    let periodIndex = 1;
                    while (event.homeScore[`period${periodIndex}`] !== undefined) {
                        periods.push([
                            event.homeScore[`period${periodIndex}`],
                            event.awayScore[`period${periodIndex}`]
                        ]);
                        periodIndex++;
                    }
                    if (periods.length > 0) {
                        if (sport === 'basketball' || sport === 'baloncesto' || sport === 'american-football') {
                            liveData.Quarters = periods;
                        } else {
                            liveData.Periods = periods;
                        }
                    }
                }
            }

            // Statistics for cards, fouls, etc.
            if (apiData.statistics?.statistics) {
                const stats = apiData.statistics.statistics;
                stats.forEach((period: any) => {
                    period.groups?.forEach((group: any) => {
                        group.statisticsItems?.forEach((item: any) => {
                            switch (item.name) {
                                case 'Yellow cards':
                                    liveData.YellowCardsHome = item.home || 0;
                                    liveData.YellowCardsAway = item.away || 0;
                                    break;
                                case 'Red cards':
                                    liveData.RedCardsHome = item.home || 0;
                                    liveData.RedCardsAway = item.away || 0;
                                    break;
                                case 'Ball possession':
                                    liveData.PossessionHome = item.home;
                                    liveData.PossessionAway = item.away;
                                    break;
                                case 'Shots on target':
                                    liveData.ShotsOnTargetHome = item.home;
                                    liveData.ShotsOnTargetAway = item.away;
                                    break;
                                case 'Corner kicks':
                                    liveData.CornersHome = item.home;
                                    liveData.CornersAway = item.away;
                                    break;
                            }
                        });
                    });
                });
            }

            // Tennis-specific data
            if (sport === 'tennis' || sport === 'tenis') {
                if (apiData['event-details']?.event) {
                    const event = apiData['event-details'].event;
                    // Extract set scores for tennis
                    if (event.homeScore?.period1 !== undefined) {
                        const sets = [];
                        let setIndex = 1;
                        while (event.homeScore[`period${setIndex}`] !== undefined) {
                            sets.push([
                                event.homeScore[`period${setIndex}`],
                                event.awayScore[`period${setIndex}`]
                            ]);
                            setIndex++;
                        }
                        liveData.Sets = sets;
                        liveData.SetsHome = sets.filter(set => set[0] > set[1]).length;
                        liveData.SetsAway = sets.filter(set => set[1] > set[0]).length;
                    }
                }
            }

            // Add incidents data for live events
            if (apiData.incidents?.incidents) {
                liveData.RecentIncidents = apiData.incidents.incidents
                    .slice(0, 5)
                    .map((incident: any) => ({
                        time: incident.time,
                        type: incident.incidentType,
                        team: incident.isHome ? 'home' : 'away',
                        player: incident.player?.name,
                        description: incident.text
                    }));
            }

        } catch (error) {
            console.warn('[API] Error extracting live data:', error);
        }

        return liveData;
    }

    /**
     * Extract team information from API data
     */
    private extractTeamInfo(apiData: any): any {
        const teams: any = {};

        try {
            if (apiData['event-details']?.event) {
                const event = apiData['event-details'].event;
                teams.home = {
                    id: event.homeTeam?.id,
                    name: event.homeTeam?.name,
                    shortName: event.homeTeam?.shortName,
                    logo: `https://img.sofascore.com/api/v1/team/${event.homeTeam?.id}/image`
                };
                teams.away = {
                    id: event.awayTeam?.id,
                    name: event.awayTeam?.name,
                    shortName: event.awayTeam?.shortName,
                    logo: `https://img.sofascore.com/api/v1/team/${event.awayTeam?.id}/image`
                };
            }
        } catch (error) {
            console.warn('[API] Error extracting team info:', error);
        }

        return teams;
    }

    /**
     * Extract tournament/league information
     */
    private extractTournamentInfo(apiData: any): any {
        const tournament: any = {};

        try {
            if (apiData['event-details']?.event?.tournament) {
                const t = apiData['event-details'].event.tournament;
                tournament.id = t.id;
                tournament.name = t.name;
                tournament.slug = t.slug;
                tournament.logo = `https://img.sofascore.com/api/v1/unique-tournament/${t.uniqueTournament?.id}/image`;
                tournament.category = t.category?.name;
                tournament.country = t.category?.alpha2;
            }
        } catch (error) {
            console.warn('[API] Error extracting tournament info:', error);
        }

        return tournament;
    }

    /**
     * Extract media assets (images, logos, etc.)
     */
    private extractMediaAssets(apiData: any, eventId: string): any {
        const media: any = {};

        try {
            media.teamImages = {
                home: apiData['event-details']?.event?.homeTeam?.id ?
                    `https://img.sofascore.com/api/v1/team/${apiData['event-details'].event.homeTeam.id}/image` : null,
                away: apiData['event-details']?.event?.awayTeam?.id ?
                    `https://img.sofascore.com/api/v1/team/${apiData['event-details'].event.awayTeam.id}/image` : null
            };

            media.tournamentImage = apiData['event-details']?.event?.tournament?.uniqueTournament?.id ?
                `https://img.sofascore.com/api/v1/unique-tournament/${apiData['event-details'].event.tournament.uniqueTournament.id}/image` : null;

            media.jerseys = {
                home: `https://img.sofascore.com/api/v1/event/${eventId}/jersey/home/player/clean`,
                away: `https://img.sofascore.com/api/v1/event/${eventId}/jersey/away/player/clean`
            };

        } catch (error) {
            console.warn('[API] Error extracting media assets:', error);
        }

        return media;
    }
}
