import { Browser, Page, HTTPResponse } from 'puppeteer';
import { SofaSport } from '../../common/commonTypes';

export class SofaScoreDataInterceptor {
    private browser: Browser;
    private interceptedData: Map<string, any> = new Map();

    constructor(browser: Browser) {
        this.browser = browser;
    }

    async collectSportsAndEvents(): Promise<{ consolidatedData: any }> {
        console.log("🚀 Starting SofaScore data interception strategy...");
        
        const page = await this.browser.newPage();
        const consolidatedData: any = {
            sports: {},
            events: {},
            teams: {},
            tournaments: {},
            media: {}
        };

        try {
            // Set up request/response interception
            await this.setupNetworkInterception(page);
            
            // Step 1: Go to SofaScore homepage to get sports list
            console.log("📍 Step 1: Loading SofaScore homepage to discover sports...");
            await page.goto('https://www.sofascore.com/es/', { 
                waitUntil: 'networkidle0',
                timeout: 60000 
            });

            // Step 2: Extract sports from the navigation
            const sports = await this.extractSportsFromNavigation(page);
            console.log(`🏈 Found ${sports.length} sports with live events`);

            // Step 3: For each sport, collect live events by visiting sport pages
            for (const sport of sports.slice(0, 3)) { // Limit to first 3 sports for testing
                console.log(`\n🔍 Processing sport: ${sport.name} (${sport.slug})`);
                
                // Visit sport page and click "En Vivo" button
                const sportEvents = await this.collectSportEvents(page, sport);
                consolidatedData.sports[sport.slug] = {
                    ...sport,
                    events: sportEvents
                };

                // For each event, visit the match page to collect detailed data
                for (const event of sportEvents.slice(0, 2)) { // Limit to 2 events per sport
                    console.log(`\n📊 Collecting detailed data for event: ${event.id}`);
                    const eventData = await this.collectEventData(page, event);
                    consolidatedData.events[event.id] = eventData;
                }
            }

            console.log("\n✅ Data collection completed!");
            return { consolidatedData };

        } catch (error) {
            console.error("❌ Error during data interception:", error);
            throw error;
        } finally {
            await page.close();
        }
    }

    private async setupNetworkInterception(page: Page): Promise<void> {
        console.log("🕸️ Setting up network interception...");
        
        // Clear previous data
        this.interceptedData.clear();

        // Intercept all responses
        page.on('response', async (response: HTTPResponse) => {
            const url = response.url();
            
            // Only capture SofaScore API responses
            if (url.includes('sofascore.com/api/v1') && response.ok()) {
                try {
                    const contentType = response.headers()['content-type'];
                    if (contentType && contentType.includes('application/json')) {
                        const data = await response.json();
                        
                        // Store the response data with URL as key
                        this.interceptedData.set(url, {
                            url,
                            status: response.status(),
                            data,
                            timestamp: Date.now()
                        });
                        
                        console.log(`📡 Intercepted: ${url}`);
                    }
                } catch (error) {
                    // Skip non-JSON responses
                }
            }
        });
    }

    private async extractSportsFromNavigation(page: Page): Promise<SofaSport[]> {
        console.log("🔍 Extracting sports from navigation...");
        
        return await page.evaluate(() => {
            const sports: SofaSport[] = [];
            
            // Find the sports navigation list
            const sportsList = document.querySelector('ul[style*="width:886px"]');
            if (!sportsList) return sports;
            
            const sportItems = sportsList.querySelectorAll('li > a[href^="/es/"]');
            let sportId = 1;
            
            sportItems.forEach((item: any) => {
                const href = item.getAttribute('href');
                const sportName = item.querySelector('.sportName')?.textContent?.trim();
                const liveCount = item.querySelector('.textStyle_assistive.micro')?.textContent?.trim();
                
                if (href && sportName && liveCount && parseInt(liveCount) > 0) {
                    const slug = href.replace('/es/', '');
                    sports.push({
                        id: sportId++,
                        name: sportName,
                        slug: slug
                    });
                }
            });
            
            return sports;
        });
    }

    private async collectSportEvents(page: Page, sport: SofaSport): Promise<any[]> {
        console.log(`🏃 Collecting events for ${sport.name}...`);
        
        // Navigate to sport page
        await page.goto(`https://www.sofascore.com/es/${sport.slug}`, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // Click on "En Vivo" button
        try {
            await page.waitForSelector('button[aria-selected="true"]', { timeout: 5000 });
            
            // Extract events from the live events list
            const events = await page.evaluate(() => {
                const eventElements = document.querySelectorAll('[class*="mdDown:pt_sm"] a[data-id]');
                const events: any[] = [];
                
                eventElements.forEach((element: any) => {
                    const eventId = element.getAttribute('data-id');
                    const href = element.getAttribute('href');
                    
                    if (eventId && href) {
                        // Extract team names and other basic info
                        const homeTeam = element.querySelector('bdi.textStyle_body.medium.c_neutrals.nLv1.trunc_true')?.textContent;
                        const teamElements = element.querySelectorAll('bdi.textStyle_body.medium.c_neutrals.nLv1.trunc_true');
                        const awayTeam = teamElements[1]?.textContent;
                        
                        events.push({
                            id: eventId,
                            href: href,
                            homeTeam,
                            awayTeam,
                            url: `https://www.sofascore.com${href}`
                        });
                    }
                });
                
                return events;
            });
            
            console.log(`📋 Found ${events.length} live events for ${sport.name}`);
            return events;
            
        } catch (error) {
            console.log(`⚠️ No live events button found for ${sport.name}`);
            return [];
        }
    }

    private async collectEventData(page: Page, event: any): Promise<any> {
        console.log(`🎯 Loading match page: ${event.url}`);
        
        // Clear intercepted data for this event
        const eventInterceptedData = new Map();
        
        // Navigate to the match page
        await page.goto(event.url, {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        // Wait a bit for all API calls to complete
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Collect all intercepted data for this event
        const collectedData: any = {
            eventId: event.id,
            basicInfo: event,
            apiResponses: {},
            media: {}
        };

        // Process intercepted data
        for (const [url, response] of this.interceptedData.entries()) {
            if (url.includes(event.id)) {
                // Categorize the API response
                if (url.includes('/statistics')) {
                    collectedData.apiResponses.statistics = response.data;
                } else if (url.includes('/incidents')) {
                    collectedData.apiResponses.incidents = response.data;
                } else if (url.includes('/lineups')) {
                    collectedData.apiResponses.lineups = response.data;
                } else if (url.includes('/odds')) {
                    collectedData.apiResponses.odds = response.data;
                } else if (url.includes('/h2h')) {
                    collectedData.apiResponses.h2h = response.data;
                } else if (url.includes('/best-players')) {
                    collectedData.apiResponses.bestPlayers = response.data;
                } else if (url.includes('/highlights')) {
                    collectedData.apiResponses.highlights = response.data;
                } else if (url.includes('/graph')) {
                    collectedData.apiResponses.graph = response.data;
                } else {
                    // Store other responses generically
                    const urlParts = url.split('/');
                    const endpoint = urlParts[urlParts.length - 1];
                    collectedData.apiResponses[endpoint] = response.data;
                }
            }
        }

        // Extract team IDs and generate media URLs
        if (collectedData.apiResponses.statistics?.event) {
            const eventDetails = collectedData.apiResponses.statistics.event;
            const homeTeamId = eventDetails.homeTeam?.id;
            const awayTeamId = eventDetails.awayTeam?.id;
            const tournamentId = eventDetails.tournament?.uniqueTournament?.id;

            if (homeTeamId || awayTeamId || tournamentId) {
                collectedData.media = {
                    teamImages: {
                        home: homeTeamId ? `https://img.sofascore.com/api/v1/team/${homeTeamId}/image` : null,
                        away: awayTeamId ? `https://img.sofascore.com/api/v1/team/${awayTeamId}/image` : null
                    },
                    tournamentImage: tournamentId ? `https://img.sofascore.com/api/v1/unique-tournament/${tournamentId}/image` : null,
                    playerJerseys: {
                        home: `https://img.sofascore.com/api/v1/event/${event.id}/jersey/home/player/clean`,
                        away: `https://img.sofascore.com/api/v1/event/${event.id}/jersey/away/player/clean`
                    }
                };
            }
        }

        console.log(`📊 Collected ${Object.keys(collectedData.apiResponses).length} API responses for event ${event.id}`);
        return collectedData;
    }

    // Method to get all intercepted data (for debugging)
    getInterceptedData(): Map<string, any> {
        return this.interceptedData;
    }

    // Method to export collected data to JSON file
    async exportToFile(data: any, filename: string = 'sofascore-intercepted-data.json'): Promise<void> {
        const fs = require('fs').promises;
        await fs.writeFile(filename, JSON.stringify(data, null, 2));
        console.log(`📁 Data exported to ${filename}`);
    }
}