import { Browser, Page } from "puppeteer-core";
import { IDataSource } from "../IDataSource";
import { CombinedData, LiveEvent, Sport } from "../../common/commonTypes";
import { Live, RootObject } from "./types";
import mockDataSports from './mocks/luckiaSportsRequestMockAnswer.json';
import mockData1 from './mocks/luckia1RequestMockAnswer.json';
import mockData2 from './mocks/luckia2RequestMockAnswer.json';

const URLS = {
    stats: "https://livedataproviderv2.luckia.co/api/BetOffer/live/sport/stats?languageId=es",
    liveBase: "https://livedataproviderv2.luckia.co/api/BetOffer/live/data?languageId=es",
};
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';

// HTTP Request tracking for Luckia external API calls
let luckiaHttpRequestCounter = 0;
let luckiaHttpRequestSummary = new Map<string, { count: number; avgDuration: number; lastResponse: number; errors: number }>();

// Helper function to log Luckia HTTP requests with counter
const logLuckiaHttpRequest = (url: string): { startTime: number; requestId: number } => {
    luckiaHttpRequestCounter++;
    const startTime = Date.now();
    console.log(`🟡 [LUCKIA HTTP REQUEST #${luckiaHttpRequestCounter}] → GET ${url}`);
    return { startTime, requestId: luckiaHttpRequestCounter };
};

// Helper function to log Luckia HTTP responses with enhanced tracking
const logLuckiaHttpResponse = (status: number, duration: number, url: string, requestId: number) => {
    // Extract base URL for tracking
    const baseUrl = url.split('?')[0];
    const currentStats = luckiaHttpRequestSummary.get(baseUrl) || { count: 0, avgDuration: 0, lastResponse: 0, errors: 0 };
    
    // Update tracking statistics
    currentStats.count++;
    currentStats.avgDuration = ((currentStats.avgDuration * (currentStats.count - 1)) + duration) / currentStats.count;
    currentStats.lastResponse = status;
    
    if (status >= 200 && status < 300) {
        console.log(`🟢 [LUCKIA HTTP RESPONSE #${requestId}] ← Status: ${status} | Duration: ${duration}ms | URL: ${baseUrl}`);
    } else {
        currentStats.errors++;
        console.log(`🔴 [LUCKIA HTTP RESPONSE #${requestId}] ← Status: ${status} | Duration: ${duration}ms | URL: ${baseUrl}`);
    }
    
    luckiaHttpRequestSummary.set(baseUrl, currentStats);
    
    // Log summary every 25 requests (since Luckia has fewer endpoints)
    if (luckiaHttpRequestCounter % 25 === 0) {
        console.log(`\n📊 [LUCKIA HTTP SUMMARY] Total requests: ${luckiaHttpRequestCounter}`);
        luckiaHttpRequestSummary.forEach((stats, endpoint) => {
            console.log(`   ${endpoint}: ${stats.count} calls, avg ${Math.round(stats.avgDuration)}ms, ${stats.errors} errors`);
        });
        console.log(`📊 [LUCKIA HTTP SUMMARY] End\n`);
    }
};

// Export tracking functions for external access
export const getLuckiaHttpRequestStats = () => {
    return {
        totalRequests: luckiaHttpRequestCounter,
        endpointSummary: Object.fromEntries(luckiaHttpRequestSummary),
        lastUpdated: Date.now()
    };
};

export const resetLuckiaHttpRequestStats = () => {
    luckiaHttpRequestCounter = 0;
    luckiaHttpRequestSummary.clear();
    console.log(`🔄 [LUCKIA HTTP TRACKING] Statistics reset`);
};

const createScrapingPage = async (browser: Browser): Promise<Page> => {
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1366, height: 768 });
    return page;
};

// Transformation logic
const transformSportsData = (sportsData: any[]): Sport[] => {
    return sportsData.map((sport) => ({
        key: sport.sportName,
        group: sport.sportName,
        title: sport.sportName,
        description: sport.sportName,
        active: sport.count > 0,
        has_outrights: false,
    }));
};

const transformLiveEventsDataForClient = (eventsData: Live[]): LiveEvent[] => {
    return Object.values(eventsData).map((event) => ({
        api_name: 'luckia',
        id: event.id,
        sport_group: event.sn,
        sport_category: event.catn,
        sport_title: event.cn,
        home_team: event.t1n,
        away_team: event.t2n,
        commence_time: event.st,
        start_time: event.sdt,
        status: event.s, // This is now string, but LiveEvent expects number. Let's fix LiveEvent type
        startTime: event.sdt,
        match_time: event.mt,
        // FIX: Parse string scores to number for these fields
        team1_score: parseInt(event.t1s, 10) || 0,
        team2_score: parseInt(event.t2s, 10) || 0,
        active: event.a,
        bettingActive: event.ba,
        // FIX: The source `t1s` and `t2s` are strings, which now matches the 'scores' property
        scores: { home: event.t1s, away: event.t2s, additionalScores: { home: event.t1ss && event.t1ss.length > 1 ? event.t1ss : null, away: event.t2ss && event.t2ss.length > 1 ? event.t2ss : null } },
        markets: (event.bo ?? []).map((market: any) => ({
            name: market.btn,
            key: market.bid,
            outcomes: market.p.map((outcome: any) => ({
                name: outcome.tpn,
                price: outcome.od,
                point: null,
                suspended: !market.v,
                oddChange: outcome.doi || 0,
            })),
        })),
        bookmakers: [],
    }));
};

// Live data fetching logic
const fetchSportsStats = async (browser: Browser): Promise<Sport[] | null> => {
    let page: Page | null = null;
    try {
        page = await createScrapingPage(browser);
        const { startTime, requestId } = logLuckiaHttpRequest(URLS.stats);
        const response = await page.goto(URLS.stats, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const requestDuration = Date.now() - startTime;
        
        if (response && response.ok()) {
            logLuckiaHttpResponse(response.status(), requestDuration, URLS.stats, requestId);
            const data = await response.json();
            if (data && Array.isArray(data.eventStatistics)) {
                console.log(`🟡 [LUCKIA] Fetched ${data.eventStatistics.length} sports statistics`);
                return transformSportsData(data.eventStatistics);
            }
        } else {
            logLuckiaHttpResponse(response?.status() || 0, requestDuration, URLS.stats, requestId);
        }
        return null;
    } catch (error) {
        console.error('🔴 [LUCKIA] An error occurred during fetchSportsStats:', error);
        return null;
    } finally {
        if (page) await page.close();
    }
};

const fetchAllLiveData = async (browser: Browser): Promise<LiveEvent[] | null> => {
    const fetchedEvents: LiveEvent[] = [];
    let pageIndex = 1;
    let keepFetching = true;
    while(keepFetching) {
        let page: Page | null = null;
        try {
            page = await createScrapingPage(browser);
            const url = `${URLS.liveBase}&pageIndex=${pageIndex}`;
            const { startTime, requestId } = logLuckiaHttpRequest(url);
            const response = await page.goto(url);
            const requestDuration = Date.now() - startTime;
            
            if(response && response.ok()){
                logLuckiaHttpResponse(response.status(), requestDuration, url, requestId);
                const data: RootObject = await response.json();
                if(data && data.live && data.live.length > 0){
                    const transformed = transformLiveEventsDataForClient(data.live);
                    fetchedEvents.push(...transformed);
                    console.log(`🟡 [LUCKIA] Fetched page ${pageIndex} with ${data.live.length} events (total: ${fetchedEvents.length})`);
                    pageIndex++;
                } else {
                    console.log(`🟡 [LUCKIA] No more data on page ${pageIndex}, stopping pagination`);
                    keepFetching = false;
                }
            } else {
                logLuckiaHttpResponse(response?.status() || 0, requestDuration, url, requestId);
                keepFetching = false;
            }
        } catch(e){
            console.error('🔴 [LUCKIA] Error during fetchAllLiveData:', e);
            keepFetching = false;
        } finally {
            if(page) await page.close();
        }
    }
    console.log(`🟡 [LUCKIA] Completed live data fetch: ${fetchedEvents.length} total events from ${pageIndex - 1} pages`);
    return fetchedEvents;
};

// Mock data logic
let mockToggle = false;
const fetchMockData = (): Promise<CombinedData | null> => {
    // The cast to RootObject will now work correctly with the updated 'Live' type
    const currentMock: RootObject = mockToggle ? mockData2 as unknown as RootObject : mockData1 as unknown as RootObject;
    
    const liveEvents = transformLiveEventsDataForClient(currentMock.live);
    const sports = transformSportsData((mockDataSports as any).eventStatistics);

    console.log(`🔄 Sending Luckia mock data file: ${mockToggle ? 'luckia2' : 'luckia1'}.json`);
    mockToggle = !mockToggle;

    return Promise.resolve({ sports, liveEvents });
};


// Main source object
const LuckiaDataSource: IDataSource = {
    name: 'luckia',
    fetchData: async (browser: Browser | null): Promise<CombinedData | null> => {
        if (process.env.USE_MOCK_DATA === 'true') {
            return fetchMockData();
        }

        if (!browser) {
            console.error("Browser instance is required for live Luckia scraping.");
            return null;
        }

        const [sportsResult, liveEventsResult] = await Promise.all([
            fetchSportsStats(browser),
            fetchAllLiveData(browser)
        ]);

        if (!sportsResult || !liveEventsResult) {
            console.warn("⚠️ Could not fetch all required data from Luckia.");
            return null;
        }

        return {
            sports: sportsResult,
            liveEvents: liveEventsResult,
        };
    }
};

export default LuckiaDataSource;