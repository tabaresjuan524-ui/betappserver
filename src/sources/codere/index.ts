import { Browser, Page } from "puppeteer-core";
import { IDataSource } from "../IDataSource";
import { CombinedData, LiveEvent, Sport } from "../../common/commonTypes";
import { CodereRoot, Event as CodereEvent, NewCodereEvent, LiveSport, CodereLeftMenuData, CodereSubmenu, CodereCategories } from "./types";

// New interface for the updated API response
interface CodereLiveEventsResponse {
    SportHandleList: string[];
    Events: NewCodereEvent[];
}
import { cacheManager } from "../../common/cacheManager";
import { leagueLogoCache } from "../../services/leagueLogoCache";
import axios from 'axios';
import mockData1 from './mocks/coderegetHomeLiveEvents.json';
import mockData2 from './mocks/coderegetHomeLiveEvents2.json';
import mockLeftMenuData from './mocks/codereLeftMenuData.json';

// HTTP Request counter for tracking API usage
let httpRequestCounter = 0;
let httpRequestSummary = new Map<string, { count: number; avgDuration: number; lastResponse: number; errors: number }>();

// Helper function to log HTTP requests with counter
const logHttpRequest = (url: string): { startTime: number; requestId: number } => {
    httpRequestCounter++;
    const startTime = Date.now();
    console.log(`🌐 [HTTP REQUEST #${httpRequestCounter}] → GET ${url}`);
    return { startTime, requestId: httpRequestCounter };
};

// Helper function to log HTTP responses with enhanced tracking
const logHttpResponse = (status: number, duration: number, url: string, requestId: number) => {
    // Extract base URL for tracking
    const baseUrl = url.split('?')[0];
    const currentStats = httpRequestSummary.get(baseUrl) || { count: 0, avgDuration: 0, lastResponse: 0, errors: 0 };

    // Update tracking statistics
    currentStats.count++;
    currentStats.avgDuration = ((currentStats.avgDuration * (currentStats.count - 1)) + duration) / currentStats.count;
    currentStats.lastResponse = status;

    if (status >= 200 && status < 300) {
        console.log(`✅ [HTTP RESPONSE #${requestId}] ← Status: ${status} | Duration: ${duration}ms | URL: ${baseUrl}`);
    } else {
        currentStats.errors++;
        console.log(`❌ [HTTP RESPONSE #${requestId}] ← Status: ${status} | Duration: ${duration}ms | URL: ${baseUrl}`);
    }

    httpRequestSummary.set(baseUrl, currentStats);

    // Log summary every 50 requests
    if (httpRequestCounter % 50 === 0) {
        console.log(`\n📊 [HTTP SUMMARY] Total requests: ${httpRequestCounter}`);
        httpRequestSummary.forEach((stats, endpoint) => {
            console.log(`   ${endpoint}: ${stats.count} calls, avg ${Math.round(stats.avgDuration)}ms, ${stats.errors} errors`);
        });
        console.log(`📊 [HTTP SUMMARY] End\n`);
    }
};

/**
 * Fetch live events for a specific sport with its corresponding game types
 */
const fetchSportSpecificLiveData = async (sportHandle: string, gameTypes: string): Promise<CodereLiveEventsResponse | null> => {
    try {
        const url = `${URLS.liveEventsBySportHandle}${sportHandle}&gametypes=${gameTypes}`;
        const { startTime, requestId } = logHttpRequest(url);
        const response = await axios.get(url);
        const requestDuration = Date.now() - startTime;
        logHttpResponse(response.status, requestDuration, url, requestId);
        
        console.log(`🎯 [${sportHandle.toUpperCase()}] Fetched ${response.data?.Events?.length || 0} events with gameTypes: ${gameTypes.substring(0, 50)}...`);
        return response.data as CodereLiveEventsResponse;
    } catch (error) {
        console.error(`❌ Error fetching sport-specific data for ${sportHandle}:`, error);
        return null;
    }
};

/**
 * Fetch consolidated live data for all sports using sport-specific game types
 */
const fetchConsolidatedSportSpecificLiveData = async (): Promise<CombinedData | null> => {
    try {
        console.log(`🚀 Starting consolidated sport-specific data fetch...`);
        
        // Get the sports game types
        const sportsGameTypes = await getSportsGameTypes();
        if (!sportsGameTypes) {
            console.error(`❌ No sports game types available, falling back to main endpoint`);
            return null;
        }

        // Get the main live events to identify available sports
        const mainLiveData = await axios.get(URLS.liveEvents);
        const mainResponse = mainLiveData.data as CodereLiveEventsResponse;
        
        if (!mainResponse.SportHandleList || mainResponse.SportHandleList.length === 0) {
            console.log(`⚠️ No live sports available`);
            return { sports: [], liveEvents: [] };
        }

        console.log(`🎯 Found ${mainResponse.SportHandleList.length} live sports: ${mainResponse.SportHandleList.join(', ')}`);

        // Fetch data for each live sport in parallel
        const sportPromises = mainResponse.SportHandleList.map(async (sportHandle: string) => {
            // Get our custom game types
            const customGameTypes = getSportGameTypes(sportHandle);
            const customGameTypesArray = customGameTypes.split(';');
            
            // Find game types from API response
            const sportGameTypeData = sportsGameTypes.find((sport: any) => 
                sport.SportHandle === sportHandle || 
                sport.Name?.toLowerCase().includes(sportHandle.toLowerCase())
            );
            
            let finalGameTypes: string;
            
            if (sportGameTypeData && sportGameTypeData.GameTypes) {
                // Combine API game types with our custom ones
                const apiGameTypes = sportGameTypeData.GameTypes.map((gt: number) => gt.toString());
                const combinedGameTypes = [...new Set([...apiGameTypes, ...customGameTypesArray])];
                finalGameTypes = combinedGameTypes.join(';');
                console.log(`🎯 [SPORT MIXED] ${sportHandle} → API: ${apiGameTypes.join(';')} + Custom: ${customGameTypes} = Final: ${finalGameTypes}`);
            } else {
                // Use only our custom game types as fallback
                finalGameTypes = customGameTypes;
                console.log(`🎯 [SPORT CUSTOM] ${sportHandle} → using only custom game types: ${finalGameTypes}`);
            }
            
            return fetchSportSpecificLiveData(sportHandle, finalGameTypes);
        });

        // Wait for all sport-specific requests to complete
        const sportResponses = await Promise.all(sportPromises);
        console.log(`🎯 Completed ${sportResponses.length} sport-specific requests`);

        // Consolidate all events into a single response
        const allEvents: NewCodereEvent[] = [];
        const allSportHandles: string[] = [];

        sportResponses.forEach((response, index) => {
            if (response && response.Events) {
                allEvents.push(...response.Events);
                const sportHandle = mainResponse.SportHandleList[index];
                if (!allSportHandles.includes(sportHandle)) {
                    allSportHandles.push(sportHandle);
                }
                console.log(`📊 [${sportHandle.toUpperCase()}] Added ${response.Events.length} events`);
            }
        });

        const consolidatedResponse: CodereLiveEventsResponse = {
            SportHandleList: allSportHandles,
            Events: allEvents
        };

        console.log(`✅ Consolidated data: ${allEvents.length} total events from ${allSportHandles.length} sports`);

        // Transform the consolidated data
        const transformedData = transformNewData(consolidatedResponse);
        
        // Add left menu data
        const leftMenuData = await getLeftMenuWithCache();
        if (leftMenuData) {
            transformedData.codere = { leftMenu: leftMenuData };
        }

        return transformedData;

    } catch (error) {
        console.error(`❌ Error in consolidated sport-specific data fetch:`, error);
        return null;
    }
};

// Get appropriate game types for different sports
const getSportGameTypes = (sportHandle: string): string => {
    const gameTypeMap: Record<string, string> = {
        // Soccer variations
        'soccer': '1;18',
        'beach_soccer': '1;18',
        'virtual_soccer': '1;18',
        'efootball': '1;18',
        'futsal': '1;18',
        
        // Tennis variations
        'tennis': '97;195',
        'table_tennis': '97;393',
        
        // Basketball variations
        'basketball': '97;159;393;184;259;2083',
        'basketball_us': '97;159;393',
        'ebasket': '97;259;393',
        
        // Baseball variations
        'baseball': '97;159;959',
        'baseball_jp': '97;159;959',
        'baseball_kr': '97;159;959',
        'baseball_us': '97;159;959',
        
        // American Football variations
        'american_football': '97;159;393',
        'australian_football': '97',
        
        // Hockey variations
        'ice_hockey': '97;159;317',
        'ice_hockey_nous_live': '97;159;317',
        'ice_hockey_us': '97;159;317',
        'field_hockey': '1;18',
        
        // Volleyball variations
        'volleyball': '97;393',
        'beach_volleyball': '97;18',
        
        // Handball
        'handball': '1;18',
        
        // eSports variations
        'esports': '97',
        'eSports_sports': '1;18',
        
        // Other sports
        'badminton': '97;393',
        'waterpolo': '1;18',
        'rugby': '1;259',
        'rugby_league': '1;259',
        'snooker': '97;459',
        'squash': '97;195',
        'darts': '97',
        'padel': '97',
        'pelota': '97',
        'boxeo': '97',
        'artes_marciales': '97',
        'curling': '97',
        'motorsport': '313',
        'anticipadas': '97;1828',
        'apuestas_especiales': '911;303',
        
        // Special game types
        'alternativeHandicaps': '159;259',
        'alternativeTotals': '18;393;2083;959',
        
        // Default fallback
        'default': '1;2;4;5;6;7;8;12;14;15;18;20;22;24;25;27;29;30;31;36;37;38;39;80;82;97;98;99;102;103;104;105;109;112;113;159;184;195;199;201;204;259;260;261;366;388;389;393;1634;1635;2083;3256'
    };

    const gameTypes = gameTypeMap[sportHandle] || gameTypeMap['default'];
    console.log(`🎯 [SPORT MAPPING] ${sportHandle} → game types: ${gameTypes}`);
    return gameTypes;
};

// Enhanced external API tracking functions
export const getHttpRequestStats = () => {
    return {
        totalRequests: httpRequestCounter,
        endpointSummary: Object.fromEntries(httpRequestSummary),
        lastUpdated: Date.now()
    };
};

export const resetHttpRequestStats = () => {
    httpRequestCounter = 0;
    httpRequestSummary.clear();
    console.log(`🔄 [HTTP TRACKING] Statistics reset`);
};

/**
 * Clear sports game types cache (force refresh on next request)
 */
export const clearSportsGameTypesCache = () => {
    sportsGameTypesCache.data = null;
    sportsGameTypesCache.timestamp = 0;
    console.log(`🔄 [CACHE] Sports game types cache cleared`);
};

/**
 * Clear sport-specific events cache (force refresh on next request)
 */
export const clearSportSpecificEventsCache = () => {
    sportSpecificEventsCache.data = null;
    sportSpecificEventsCache.timestamp = 0;
    sportSpecificEventsCache.lastSports = [];
    console.log(`🔄 [CACHE] Sport-specific events cache cleared`);
};

/**
 * Get current cache status
 */
export const getCacheStatus = () => {
    const now = Date.now();
    return {
        sportsGameTypes: {
            hasData: !!sportsGameTypesCache.data,
            age: Math.round((now - sportsGameTypesCache.timestamp) / 1000),
            expiresIn: Math.round((SPORTS_GAME_TYPES_CACHE_DURATION - (now - sportsGameTypesCache.timestamp)) / 1000),
            isExpired: (now - sportsGameTypesCache.timestamp) > SPORTS_GAME_TYPES_CACHE_DURATION
        },
        sportSpecificEvents: {
            hasData: !!sportSpecificEventsCache.data,
            age: Math.round((now - sportSpecificEventsCache.timestamp) / 1000),
            expiresIn: Math.round((SPORT_SPECIFIC_EVENTS_CACHE_DURATION - (now - sportSpecificEventsCache.timestamp)) / 1000),
            isExpired: (now - sportSpecificEventsCache.timestamp) > SPORT_SPECIFIC_EVENTS_CACHE_DURATION,
            lastSports: sportSpecificEventsCache.lastSports
        },
        httpStats: getHttpRequestStats()
    };
};

/**
 * Manual trigger for sports game types fetch (for testing)
 */
export const triggerSportsGameTypesFetch = async () => {
    console.log(`🧪 [MANUAL TRIGGER] Fetching sports game types`);
    return await getSportsGameTypes();
};

/**
 * Manual trigger for sport-specific events fetch (for testing)
 */
export const triggerSportSpecificEventsFetch = async () => {
    console.log(`🧪 [MANUAL TRIGGER] Fetching sport-specific events`);
    return await getSportSpecificLiveEvents();
};

import mockSubmenuData from './mocks/codereGetSubmenuLeft.json';
import mockLeagueEventsData from './mocks/navegation/4codereNavigationServiceEventGetEvents_parentId.json';
import mockCategoriesData from './mocks/navegation/5codereNavigationServiceCategoryGetCategoriesByLeague_parentid.json';
import mockMatchCategoriesData from './mocks/navegation/8codereNavigationServiceCategoryGetCategoryNoLiveInfos_parentid.json';
import mockMatchGamesData from './mocks/navegation/7codereNavigationServiceGameGetGamesNoLiveByCategoryInfo_parentid_11644027059&categoryInfoId_99.json';
import mockLiveEventsBySportHandleData from './mocks/navegation/0NavigationService_Event_GetLiveEventsAndSportsBySportHandle_gametypes.json';
import mockSportsGameTypesData from './mocks/navigationServiceGameSportsGameTypes.json';

// Global cache for sports game types (refreshed every 60 minutes)
let sportsGameTypesCache: {
    data: any | null;
    timestamp: number;
} = {
    data: null,
    timestamp: 0
};

// Global cache for consolidated sport-specific events (refreshed every 5 seconds)
let sportSpecificEventsCache: {
    data: CombinedData | null;
    timestamp: number;
    lastSports: string[];
} = {
    data: null,
    timestamp: 0,
    lastSports: []
};

const SPORTS_GAME_TYPES_CACHE_DURATION = 60 * 60 * 1000; // 60 minutes
const SPORT_SPECIFIC_EVENTS_CACHE_DURATION = 5 * 1000; // 5 seconds

const URLS = {
    liveEvents: "https://m.codere.com.co/NavigationService/Event/GetLiveEventsAndSportsBySportHandle?gametypes=1;2;4;5;6;7;8;12;14;15;18;20;22;24;25;27;29;30;31;36;37;38;39;80;82;97;98;99;102;103;104;105;109;112;113;159;184;195;199;201;204;259;260;261;366;388;389;393;1634;1635;2083;3256",
    //mockdata for this api url can be found in: 0NavigationService_Event_GetLiveEventsAndSportsBySportHandle_gametypes.json file in mocks/navegation folder. 
    liveEventsBySportHandle: "https://m.codere.com.co/NavigationService/Event/GetLiveEventsAndSportHandle?sportHandle=",
    //fetches live events for specific sport with game types
    leftMenu: "https://m.codere.com.co/NavigationService/LeftMenu/GetMenuLeft",
    //mockdata for this api url can be found in: 1codereGetMenuLeft.json file in mocks/navegation folder.
    submenu: "https://m.codere.com.co/NavigationService/LeftMenu/GetSubmenuLeft?nodes=5&parentid=",
    //mockdata for this api url can be found in: 3codereNavigationServiceLeftMenuGetSubmenuLeft_parentid.json file in mocks/navegation folder.
    leagueEvents: "https://m.codere.com.co/NavigationService/Event/GetEvents?parentId=",
    //mockdata for this api url can be found in: 4codereNavigationServiceEventGetEvents_parentId.json file in mocks/navegation folder.
    categories: "https://m.codere.com.co/NavigationService/Category/GetCategoriesByLeague?parentid=",
    //mockdata for this api url can be found in: 5codereNavigationServiceCategoryGetCategoriesByLeague_parentid.json file in mocks/navegation folder.
    matchCategories: "https://m.codere.com.co/NavigationService/Category/GetCategoryNoLiveInfos?parentid=",
    //mockdata for this api url can be found in: 8codereNavigationServiceCategoryGetCategoryNoLiveInfos_parentid.json file in mocks/navegation folder.
    matchGames: "https://m.codere.com.co/NavigationService/Game/GetGamesNoLiveByCategoryInfo?parentid=",
    //mockdata for this api url can be found in: 7codereNavigationServiceGameGetGamesNoLiveByCategoryInfo_parentid_11644027059&categoryInfoId_99.json file in mocks/navegation folder.
    gameSportsGameTypes: "https://m.codere.com.co/NavigationService/Game/SportsGameTypes",
    //mockdata for this api url can be found in: navigationServiceGameSportsGameTypes.json file in mocks folder.
    sportSpecificEvents: "https://m.codere.com.co/NavigationService/Event/GetLiveEventsAndSportsBySportHandle",
    //fetches live events for specific sport with sport-specific game types
};

/**
 * Fetches sports game types from Codere API (cached for 60 minutes)
 */
const getSportsGameTypes = async (): Promise<any | null> => {
    const now = Date.now();
    const cacheAge = now - sportsGameTypesCache.timestamp;

    if (sportsGameTypesCache.data && cacheAge < SPORTS_GAME_TYPES_CACHE_DURATION) {
        // Return cached data if still valid
        return sportsGameTypesCache.data;
    }

    // Fetch fresh data
    console.log(`🎯 Sports game types cache expired (${Math.round(cacheAge / 1000 / 60)}min old), fetching fresh data`);
    
    try {
        let sportsGameTypes: any;

        if (process.env.USE_MOCK_DATA === 'true') {
            console.log(`🎯 Using mock sports game types data`);
            sportsGameTypes = mockSportsGameTypesData;
        } else {
            const { startTime, requestId } = logHttpRequest(URLS.gameSportsGameTypes);
            const response = await axios.get(URLS.gameSportsGameTypes);
            const requestDuration = Date.now() - startTime;
            logHttpResponse(response.status, requestDuration, URLS.gameSportsGameTypes, requestId);
            sportsGameTypes = response.data;
        }

        if (sportsGameTypes) {
            sportsGameTypesCache.data = sportsGameTypes;
            sportsGameTypesCache.timestamp = now;
            console.log(`✅ Sports game types cache updated, next refresh in ${SPORTS_GAME_TYPES_CACHE_DURATION / 1000 / 60} minutes`);
            console.log(`🎯 Available sports: ${Object.keys(sportsGameTypes.gametypes || {}).length}`);
        }

        return sportsGameTypes;
    } catch (error) {
        console.error('❌ Error fetching sports game types:', error);
        return sportsGameTypesCache.data; // Return cached data if available
    }
};

/**
 * Fetches live events for all sports with sport-specific game types (cached for 5 seconds)
 */
const getSportSpecificLiveEvents = async (): Promise<CombinedData | null> => {
    const now = Date.now();
    const cacheAge = now - sportSpecificEventsCache.timestamp;

    if (sportSpecificEventsCache.data && cacheAge < SPORT_SPECIFIC_EVENTS_CACHE_DURATION) {
        // Return cached data if still valid
        return sportSpecificEventsCache.data;
    }

    console.log(`🚀 Sport-specific events cache expired (${Math.round(cacheAge / 1000)}s old), fetching fresh data`);

    try {
        // First, get the main live events to know which sports are currently live
        let mainLiveEventsData: CodereLiveEventsResponse;

        if (process.env.USE_MOCK_DATA === 'true') {
            mainLiveEventsData = mockLiveEventsBySportHandleData as CodereLiveEventsResponse;
        } else {
            const { startTime, requestId } = logHttpRequest(URLS.liveEvents);
            const response = await axios.get(URLS.liveEvents);
            const requestDuration = Date.now() - startTime;
            logHttpResponse(response.status, requestDuration, URLS.liveEvents, requestId);
            mainLiveEventsData = response.data as CodereLiveEventsResponse;
        }

        if (!mainLiveEventsData?.SportHandleList || mainLiveEventsData.SportHandleList.length === 0) {
            console.log(`⚠️ No live sports available`);
            return null;
        }

        // Get sports game types
        const sportsGameTypes = await getSportsGameTypes();
        if (!sportsGameTypes?.gametypes) {
            console.log(`⚠️ No sports game types available, falling back to main data`);
            return transformNewData(mainLiveEventsData);
        }

        console.log(`🚀 Fetching events for ${mainLiveEventsData.SportHandleList.length} live sports: ${mainLiveEventsData.SportHandleList.join(', ')}`);

        // Store current sports for comparison
        const currentSports = [...mainLiveEventsData.SportHandleList].sort();
        const lastSports = sportSpecificEventsCache.lastSports.sort();

        // Check if sports list has changed
        const sportsChanged = JSON.stringify(currentSports) !== JSON.stringify(lastSports);
        if (sportsChanged) {
            console.log(`🔄 Sports lineup changed from [${lastSports.join(', ')}] to [${currentSports.join(', ')}]`);
        }

        // Fetch events for each live sport with its specific game types
        const allSportEvents: NewCodereEvent[] = [];
        const allSportHandles: string[] = [];

        for (const sportHandle of mainLiveEventsData.SportHandleList) {
            try {
                // Get our custom game types
                const customGameTypes = getSportGameTypes(sportHandle);
                const customGameTypesArray = customGameTypes.split(';');
                
                // Get API game types for this sport
                const apiGameTypes = sportsGameTypes.gametypes[sportHandle];
                
                let finalGameTypes: number[];
                let gameTypesParam: string;
                
                if (apiGameTypes && apiGameTypes.length > 0) {
                    // Combine API game types with our custom ones
                    const apiGameTypesStr = apiGameTypes.map((gt: number) => gt.toString());
                    const combinedGameTypesStr = [...new Set([...apiGameTypesStr, ...customGameTypesArray])];
                    finalGameTypes = combinedGameTypesStr.map(gt => parseInt(gt));
                    gameTypesParam = combinedGameTypesStr.join(';');
                    console.log(`🎯 [SPORT MIXED] ${sportHandle} → API: ${apiGameTypesStr.join(';')} + Custom: ${customGameTypes} = Final: ${gameTypesParam}`);
                } else {
                    // Use only our custom game types as fallback
                    finalGameTypes = customGameTypesArray.map(gt => parseInt(gt));
                    gameTypesParam = customGameTypes;
                    console.log(`🎯 [SPORT CUSTOM] ${sportHandle} → using only custom game types: ${gameTypesParam}`);
                }
                let sportEvents: CodereLiveEventsResponse;

                if (process.env.USE_MOCK_DATA === 'true') {
                    // Use mock data for all sports
                    sportEvents = mockLiveEventsBySportHandleData as CodereLiveEventsResponse;
                    // Filter events to simulate sport-specific data
                    sportEvents = {
                        ...sportEvents,
                        Events: sportEvents.Events?.filter(event => 
                            event.SportHandle === sportHandle || 
                            event.SportName?.toLowerCase().includes(sportHandle.toLowerCase())
                        ) || []
                    };
                } else {
                    const url = `${URLS.sportSpecificEvents}?sportHandle=${sportHandle}&gametypes=${gameTypesParam}`;
                    const { startTime, requestId } = logHttpRequest(url);
                    const response = await axios.get(url);
                    const requestDuration = Date.now() - startTime;
                    logHttpResponse(response.status, requestDuration, url, requestId);
                    sportEvents = response.data as CodereLiveEventsResponse;
                }

                if (sportEvents?.Events && sportEvents.Events.length > 0) {
                    allSportEvents.push(...sportEvents.Events);
                    allSportHandles.push(sportHandle);
                    console.log(`✅ ${sportHandle}: ${sportEvents.Events.length} events with gameTypes [${gameTypesParam}]`);
                } else {
                    console.log(`⚠️ ${sportHandle}: No events returned`);
                }

            } catch (sportError) {
                console.error(`❌ Error fetching events for sport ${sportHandle}:`, sportError);
                // Continue with other sports even if one fails
            }
        }

        // Transform consolidated events
        const consolidatedResponse: CodereLiveEventsResponse = {
            SportHandleList: allSportHandles,
            Events: allSportEvents
        };

        const transformedData = transformNewData(consolidatedResponse);

        // Add left menu data
        const leftMenuData = await getLeftMenuWithCache();
        if (leftMenuData) {
            transformedData.codere = { leftMenu: leftMenuData };
        }

        // Update cache
        sportSpecificEventsCache.data = transformedData;
        sportSpecificEventsCache.timestamp = now;
        sportSpecificEventsCache.lastSports = currentSports;

        console.log(`🚀 Consolidated ${allSportEvents.length} events from ${allSportHandles.length} sports, next refresh in ${SPORT_SPECIFIC_EVENTS_CACHE_DURATION / 1000}s`);

        return transformedData;

    } catch (error) {
        console.error('❌ Error fetching sport-specific live events:', error);
        return sportSpecificEventsCache.data; // Return cached data if available
    }
};
/**
 * Fetches the leagues for a given node ID using the cache manager.
 * @param nodeId The ID of the node to fetch leagues for.
 * @param clientId The client ID requesting the data.
 * @param callback Optional callback to execute when data updates.
 * @returns The cached submenu data or null if not available.
 */
export const subscribeToLeagues = (nodeId: string, clientId: string, callback?: (data: CodereSubmenu | null) => void): CodereSubmenu | null => {
    const endpoint = `leagues_${nodeId}`;

    const fetcher = async (): Promise<CodereSubmenu | null> => {
        try {
            if (process.env.USE_MOCK_DATA === 'true') {
                return mockSubmenuData as CodereSubmenu;
            }
            const requestUrl = `${URLS.submenu}${nodeId}`;
            const { startTime, requestId } = logHttpRequest(requestUrl);
            const response = await axios.get(requestUrl);
            const requestDuration = Date.now() - startTime;
            logHttpResponse(response.status, requestDuration, requestUrl, requestId);
            return response.data as CodereSubmenu;
        } catch (error) {
            console.error(`Error fetching leagues for nodeId ${nodeId}:`, error);
            return null;
        }
    };

    // Use longer cache duration for menu data to reduce flickering (10 minutes)
    return cacheManager.subscribe(endpoint, clientId, fetcher, callback, 600000);
};

/**
 * Unsubscribe from leagues data for a specific node ID
 */
export const unsubscribeFromLeagues = (nodeId: string, clientId: string): void => {
    const endpoint = `leagues_${nodeId}`;
    cacheManager.unsubscribe(endpoint, clientId);
};

/**
 * Subscribe to league events using the cache manager with enhanced games data.
 * @param leagueNodeId The ID of the league to fetch events for.
 * @param clientId The client ID requesting the data.
 * @param callback Optional callback to execute when data updates.
 * @returns The cached events or null if not available.
 */
export const subscribeToLeagueEvents = (leagueNodeId: string, clientId: string, callback?: (data: LiveEvent[] | null) => void): LiveEvent[] | null => {
    const endpoint = `leagueEvents_${leagueNodeId}`;

    const fetcher = async (): Promise<LiveEvent[] | null> => {
        try {
            console.log(`🔍 BACKEND DEBUG - Fetching events for league: ${leagueNodeId}`);
            let rawEvents: CodereEvent[];

            if (process.env.USE_MOCK_DATA === 'true') {
                console.log(`🔍 BACKEND DEBUG - Using mock data`);
                rawEvents = mockLeagueEventsData as unknown as CodereEvent[];
            } else {
                const url = `${URLS.leagueEvents}${leagueNodeId}`;
                const response = await axios.get(url);
                rawEvents = response.data as CodereEvent[];
            }

            // Transform Codere events to LiveEvent format
            let liveEvents = transformCodereEventsToLiveEvents(rawEvents);
            console.log(`🔍 BACKEND DEBUG - Transformed to ${liveEvents.length} LiveEvents`);

            // Initialize marketsCount for all events using ChildrenCount from API
            liveEvents.forEach((event, index) => {
                // Find the original raw event to get ChildrenCount
                const originalEvent = rawEvents.find(raw =>
                    raw.NodeId === String(event.id) ||
                    raw.Name === `${event.home_team} - ${event.away_team}`
                );
                liveEvents[index].marketsCount = originalEvent?.ChildrenCount || (event.markets ? event.markets.length : 0);
            });

            // 🎯 ENHANCEMENT: Automatically fetch enhanced games data and merge
            try {
                console.log(`🎯 BACKEND ENHANCEMENT - Fetching enhanced games data for league: ${leagueNodeId}`);

                // Get categories to extract categoryIds
                let categories: CodereCategories;
                if (process.env.USE_MOCK_DATA === 'true') {
                    categories = mockCategoriesData as CodereCategories;
                } else {
                    const categoriesUrl = `${URLS.categories}${leagueNodeId}`;
                    const requestStartTime = Date.now();
                    console.log(`🌐 [HTTP REQUEST] GET ${categoriesUrl}`);
                    const categoriesResponse = await axios.get(categoriesUrl);
                    const requestDuration = Date.now() - requestStartTime;
                    console.log(`✅ [HTTP RESPONSE] Status: ${categoriesResponse.status} | Duration: ${requestDuration}ms | URL: ${categoriesUrl}`);
                    categories = categoriesResponse.data as CodereCategories;
                }

                // Extract categoryIds
                const categoryIds: number[] = [];
                categories.forEach((category) => {
                    if (category.CategoryId) {
                        categoryIds.push(parseInt(category.CategoryId));
                    }
                });

                if (categoryIds.length > 0) {
                    const gameTypesParam = categoryIds.join(';');
                    let eventsWithGames: any[];

                    if (process.env.USE_MOCK_DATA === 'true') {
                        const mockData = await import('./mocks/navegation/6codereNavigationServiceEventGetEvents_parentId_819833650&gameTypes=97;159;393;184;259;2083.json');
                        eventsWithGames = mockData.default;
                    } else {
                        const eventsWithGamesUrl = `${URLS.leagueEvents}${leagueNodeId}&gameTypes=${gameTypesParam}`;
                        const requestStartTime = Date.now();
                        console.log(`🌐 [HTTP REQUEST] GET ${eventsWithGamesUrl}`);
                        const eventsResponse = await axios.get(eventsWithGamesUrl);
                        const requestDuration = Date.now() - requestStartTime;
                        console.log(`✅ [HTTP RESPONSE] Status: ${eventsResponse.status} | Duration: ${requestDuration}ms | URL: ${eventsWithGamesUrl}`);
                        eventsWithGames = eventsResponse.data || [];
                    }

                    console.log(`🎯 BACKEND ENHANCEMENT - Fetched ${eventsWithGames.length} enhanced events with ${gameTypesParam} gameTypes`);

                    // Merge enhanced games into existing events
                    liveEvents.forEach((liveEvent, index) => {
                        const matchingEnhancedEvent = eventsWithGames.find(enhanced =>
                            enhanced.NodeId === String(liveEvent.id) ||
                            enhanced.Name === `${liveEvent.home_team} - ${liveEvent.away_team}`
                        );

                        if (matchingEnhancedEvent && matchingEnhancedEvent.Games) {
                            const additionalMarkets = matchingEnhancedEvent.Games.map((game: any) => ({
                                name: game.Name,
                                key: game.NodeId,
                                outcomes: game.Results?.map((result: any) => ({
                                    name: result.Name,
                                    price: result.Odd,
                                    point: result.GameSpecialOddsValue?.replace(/<Spov>|<\/Spov>/g, '') || '',
                                    suspended: result.Locked,
                                    oddChange: 0,
                                })) || [],
                            }));

                            // Merge additional markets, avoiding duplicates
                            const existingMarketKeys = new Set(liveEvent.markets.map(m => m.key));
                            const newMarkets = additionalMarkets.filter((market: any) => !existingMarketKeys.has(market.key));

                            liveEvents[index].markets = [...liveEvent.markets, ...newMarkets];
                            // Keep the original ChildrenCount instead of using markets.length
                            // liveEvents[index].marketsCount = liveEvents[index].markets.length;

                            console.log(`🎯 ENHANCED EVENT: ${liveEvent.home_team} vs ${liveEvent.away_team} - Added ${newMarkets.length} new markets (total: ${liveEvents[index].markets.length})`);
                        }
                    });
                }
            } catch (enhancementError) {
                console.error(`⚠️ BACKEND WARNING - Enhancement failed for league ${leagueNodeId}:`, enhancementError);
                // Continue with regular events if enhancement fails
            }

            return liveEvents;
        } catch (error) {
            console.error(`❌ BACKEND ERROR - Error fetching league events for leagueNodeId ${leagueNodeId}:`, error);
            return null;
        }
    };

    // Use shorter cache duration for live events to keep them fresh (10 seconds)
    return cacheManager.subscribe(endpoint, clientId, fetcher, callback, 10000);
};

/**
 * Unsubscribe from league events for a specific league node ID
 */
export const unsubscribeFromLeagueEvents = (leagueNodeId: string, clientId: string): void => {
    const endpoint = `leagueEvents_${leagueNodeId}`;
    cacheManager.unsubscribe(endpoint, clientId);
};

/**
 * Subscribe to league categories using the cache manager.
 * @param leagueNodeId The ID of the league to fetch categories for.
 * @param clientId The client ID requesting the data.
 * @param callback Optional callback to execute when data updates.
 * @returns The cached categories or null if not available.
 */
export const subscribeToLeagueCategories = (leagueNodeId: string, clientId: string, callback?: (data: CodereCategories | null) => void): CodereCategories | null => {
    const endpoint = `leagueCategories_${leagueNodeId}`;

    const fetcher = async (): Promise<CodereCategories | null> => {
        try {
            console.log(`🔍 BACKEND DEBUG - Fetching categories for league: ${leagueNodeId}`);
            let categories: CodereCategories;

            if (process.env.USE_MOCK_DATA === 'true') {
                console.log(`🔍 BACKEND DEBUG - Using mock categories data`);
                categories = mockCategoriesData as CodereCategories;
            } else {
                const url = `${URLS.categories}${leagueNodeId}`;
                const requestStartTime = Date.now();
                console.log(`🌐 [HTTP REQUEST] GET ${url}`);
                const response = await axios.get(url);
                const requestDuration = Date.now() - requestStartTime;
                console.log(`✅ [HTTP RESPONSE] Status: ${response.status} | Duration: ${requestDuration}ms | URL: ${url}`);
                categories = response.data as CodereCategories;
            }

            console.log(`🔍 BACKEND DEBUG - Fetched ${categories.length} categories`);
            return categories;
        } catch (error) {
            console.error(`❌ BACKEND ERROR - Error fetching categories for leagueNodeId ${leagueNodeId}:`, error);
            return null;
        }
    };

    // Use 10 minutes cache duration for categories (600000ms)
    return cacheManager.subscribe(endpoint, clientId, fetcher, callback, 600000);
};

/**
 * Unsubscribe from league categories for a specific league node ID
 */
export const unsubscribeFromLeagueCategories = (leagueNodeId: string, clientId: string): void => {
    const endpoint = `leagueCategories_${leagueNodeId}`;
    cacheManager.unsubscribe(endpoint, clientId);
};

/**
 * Subscribe to league events with enhanced games data
 * This function extracts categoryIds from categories and makes additional API calls with gameTypes parameter
 */
export const subscribeToLeagueEventsWithGames = (leagueNodeId: string, clientId: string, callback?: (data: any[] | null) => void): any[] | null => {
    const endpoint = `leagueEventsWithGames_${leagueNodeId}`;

    const fetcher = async (): Promise<any[] | null> => {
        try {
            console.log(`🔍 BACKEND DEBUG - Fetching events with games for league: ${leagueNodeId}`);

            // First, get the categories to extract categoryIds
            let categories: CodereCategories;

            if (process.env.USE_MOCK_DATA === 'true') {
                console.log(`🔍 BACKEND DEBUG - Using mock categories data for gameTypes extraction`);
                categories = mockCategoriesData as CodereCategories;
            } else {
                const categoriesUrl = `${URLS.categories}${leagueNodeId}`;
                const categoriesResponse = await axios.get(categoriesUrl);
                categories = categoriesResponse.data as CodereCategories;
            }

            // Extract categoryIds from the categories response
            const categoryIds: number[] = [];
            categories.forEach((category) => {
                if (category.CategoryId) {
                    categoryIds.push(parseInt(category.CategoryId));
                }
            });

            if (categoryIds.length === 0) {
                console.log(`⚠️ BACKEND WARNING - No category IDs found for league ${leagueNodeId}`);
                return [];
            }

            // Make the new call with gameTypes parameter
            const gameTypesParam = categoryIds.join(';');

            let eventsWithGames: any[];

            if (process.env.USE_MOCK_DATA === 'true') {
                console.log(`🔍 BACKEND DEBUG - Using mock events with games data`);
                // Use existing mock data that has the gameTypes structure
                const mockData = await import('./mocks/navegation/6codereNavigationServiceEventGetEvents_parentId_819833650&gameTypes=97;159;393;184;259;2083.json');
                eventsWithGames = mockData.default;
            } else {
                const eventsWithGamesUrl = `${URLS.leagueEvents}${leagueNodeId}&gameTypes=${gameTypesParam}`;
                console.log(`🔍 BACKEND DEBUG - Fetching from URL: ${eventsWithGamesUrl}`);

                const eventsResponse = await axios.get(eventsWithGamesUrl);
                eventsWithGames = eventsResponse.data || [];
            }

            console.log(`🔍 BACKEND DEBUG - Fetched ${eventsWithGames.length} events with games for league ${leagueNodeId} with gameTypes: ${gameTypesParam}`);
            return eventsWithGames;
        } catch (error) {
            console.error(`❌ BACKEND ERROR - Error fetching events with games for leagueNodeId ${leagueNodeId}:`, error);
            return null;
        }
    };

    // Use 5 seconds cache duration as requested
    return cacheManager.subscribe(endpoint, clientId, fetcher, callback, 5000);
};

/**
 * Unsubscribe from league events with games for a specific league node ID
 */
export const unsubscribeFromLeagueEventsWithGames = (leagueNodeId: string, clientId: string): void => {
    const endpoint = `leagueEventsWithGames_${leagueNodeId}`;
    cacheManager.unsubscribe(endpoint, clientId);
};

/**
 * Subscribe to match categories using the cache manager.
 * @param matchId The ID of the match to fetch categories for.
 * @param clientId The client ID requesting the data.
 * @param callback Optional callback to execute when data updates.
 * @returns The cached match categories or null if not available.
 */
export const subscribeToMatchCategories = (matchId: string, clientId: string, callback?: (data: any[] | null) => void): any[] | null => {
    const endpoint = `matchCategories_${matchId}`;

    const fetcher = async (): Promise<any[] | null> => {
        try {
            console.log(`🔍 BACKEND DEBUG - Fetching categories for match: ${matchId}`);
            let categories: any[];

            if (process.env.USE_MOCK_DATA === 'true') {
                console.log(`🔍 BACKEND DEBUG - Using mock match categories data`);
                categories = mockMatchCategoriesData as any[];
            } else {
                const url = `${URLS.matchCategories}${matchId}`;
                const response = await axios.get(url);
                categories = response.data || [];
            }

            console.log(`🔍 BACKEND DEBUG - Fetched ${categories.length} match categories`);
            return categories;
        } catch (error) {
            console.error(`❌ BACKEND ERROR - Error fetching categories for matchId ${matchId}:`, error);
            return null;
        }
    };

    // Use 10 minutes cache duration for match categories (600000ms)
    return cacheManager.subscribe(endpoint, clientId, fetcher, callback, 600000);
};

/**
 * Unsubscribe from match categories for a specific match ID
 */
export const unsubscribeFromMatchCategories = (matchId: string, clientId: string): void => {
    const endpoint = `matchCategories_${matchId}`;
    cacheManager.unsubscribe(endpoint, clientId);
};

/**
 * Subscribe to match games using the cache manager.
 * @param matchId The ID of the match to fetch games for.
 * @param categoryId The ID of the category to fetch games for.
 * @param clientId The client ID requesting the data.
 * @param callback Optional callback to execute when data updates.
 * @returns The cached match games or null if not available.
 */
export const subscribeToMatchGames = (matchId: string, categoryId: string, clientId: string, callback?: (data: any | null) => void): any | null => {
    const endpoint = `matchGames_${matchId}_${categoryId}`;

    const fetcher = async (): Promise<any | null> => {
        try {
            console.log(`🔍 BACKEND DEBUG - Fetching games for match: ${matchId}, category: ${categoryId}`);
            let games: any;

            if (process.env.USE_MOCK_DATA === 'true') {
                console.log(`🔍 BACKEND DEBUG - Using mock match games data`);
                games = mockMatchGamesData;
            } else {
                const url = `${URLS.matchGames}${matchId}&categoryInfoId=${categoryId}`;
                const response = await axios.get(url);
                games = response.data;
            }

            console.log(`🔍 BACKEND DEBUG - Fetched games data for match ${matchId}, category ${categoryId}`);
            return games;
        } catch (error) {
            console.error(`❌ BACKEND ERROR - Error fetching games for matchId ${matchId}, categoryId ${categoryId}:`, error);
            return null;
        }
    };

    // Use 10 seconds cache duration for match games as requested
    return cacheManager.subscribe(endpoint, clientId, fetcher, callback, 10000);
};

/**
 * Unsubscribe from match games for a specific match and category ID
 */
export const unsubscribeFromMatchGames = (matchId: string, categoryId: string, clientId: string): void => {
    const endpoint = `matchGames_${matchId}_${categoryId}`;
    cacheManager.unsubscribe(endpoint, clientId);
};

// Keep the old functions for backward compatibility but mark them as deprecated
/**
 * @deprecated Use subscribeToLeagues instead
 */
export const getLeagues = async (nodeId: string): Promise<CodereSubmenu | null> => {
    try {
        if (process.env.USE_MOCK_DATA === 'true') {
            return mockSubmenuData as CodereSubmenu;
        }
        const response = await axios.get(`${URLS.submenu}${nodeId}`);
        return response.data as CodereSubmenu;
    } catch (error) {
        console.error(`Error fetching leagues for nodeId ${nodeId}:`, error);
        return null;
    }
};

/**
 * @deprecated Use subscribeToLeagueEvents instead
 */
export const getLeagueEvents = async (leagueNodeId: string): Promise<LiveEvent[] | null> => {
    // Use cache manager for a temporary client
    const tempClientId = `temp_${Date.now()}`;
    const result = subscribeToLeagueEvents(leagueNodeId, tempClientId);

    // Immediately unsubscribe since this is a one-time request
    setTimeout(() => {
        unsubscribeFromLeagueEvents(leagueNodeId, tempClientId);
    }, 100);

    return Promise.resolve(result);
};

/**
 * Subscribe to left menu data using the cache manager.
 * @param clientId The client ID requesting the data.
 * @returns The cached left menu data or null if not available.
 */
export const subscribeToLeftMenu = (clientId: string): CodereLeftMenuData | null => {
    const endpoint = 'leftMenu';

    const fetcher = async (): Promise<CodereLeftMenuData | null> => {
        try {
            if (process.env.USE_MOCK_DATA === 'true') {
                return mockLeftMenuData as CodereLeftMenuData;
            }
            const response = await axios.get(URLS.leftMenu);
            if (response.data) {
                return response.data as CodereLeftMenuData;
            }
            console.error(`Codere: Failed to get a valid response from leftMenu endpoint. Status: ${response?.status}`);
            return null;
        } catch (error) {
            console.error('Codere: An error occurred during fetchLeftMenuData:', error);
            return null;
        }
    };

    // Use 10 minutes cache for left menu (600000ms)
    return cacheManager.subscribe(endpoint, clientId, fetcher, undefined, 6000000);
};

/**
 * Unsubscribe from left menu data
 */
export const unsubscribeFromLeftMenu = (clientId: string): void => {
    const endpoint = 'leftMenu';
    cacheManager.unsubscribe(endpoint, clientId);
};

/**
 * @deprecated Use subscribeToLeftMenu instead - kept for backward compatibility
 */
const fetchLeftMenuData = async (): Promise<CodereLeftMenuData | null> => {
    // Use cache manager for temporary client
    const tempClientId = `temp_leftmenu_${Date.now()}`;
    const result = subscribeToLeftMenu(tempClientId);

    // Clean up the temporary subscription after a short delay
    setTimeout(() => {
        unsubscribeFromLeftMenu(tempClientId);
    }, 100);

    return Promise.resolve(result);
};

/**
 * Direct fetch for main data cycle - bypasses cache manager
 */
const fetchLeftMenuDataDirect = async (): Promise<CodereLeftMenuData | null> => {
    try {
        if (process.env.USE_MOCK_DATA === 'true') {
            return mockLeftMenuData as CodereLeftMenuData;
        }
        const { startTime, requestId } = logHttpRequest(URLS.leftMenu);
        const response = await axios.get(URLS.leftMenu);
        const requestDuration = Date.now() - startTime;
        logHttpResponse(response.status, requestDuration, URLS.leftMenu, requestId);
        if (response.data) {
            return response.data as CodereLeftMenuData;
        }
        console.error(`Codere: Failed to get a valid response from leftMenu endpoint. Status: ${response?.status}`);
        return null;
    } catch (error) {
        console.error('Codere: An error occurred during fetchLeftMenuDataDirect:', error);
        return null;
    }
};

// Cache for left menu data with 60-second expiry
let leftMenuCache: {
    data: CodereLeftMenuData | null;
    timestamp: number;
} = {
    data: null,
    timestamp: 0
};

const LEFT_MENU_CACHE_DURATION = 60000; // 60 seconds

/**
 * Get left menu data with 60-second cache
 */
const getLeftMenuWithCache = async (): Promise<CodereLeftMenuData | null> => {
    const now = Date.now();
    const cacheAge = now - leftMenuCache.timestamp;

    if (leftMenuCache.data && cacheAge < LEFT_MENU_CACHE_DURATION) {
        // Return cached data if still valid
        return leftMenuCache.data;
    }

    // Fetch fresh data
    console.log(`🔄 Left menu cache expired (${Math.round(cacheAge / 1000)}s old), fetching fresh data`);
    const freshData = await fetchLeftMenuDataDirect();

    if (freshData) {
        leftMenuCache.data = freshData;
        leftMenuCache.timestamp = now;
        console.log(`✅ Left menu cache updated, next refresh in ${LEFT_MENU_CACHE_DURATION / 1000}s`);
    }

    return freshData;
};

/**
 * Helper function to create a new Puppeteer page with standard settings.
 */
const createScrapingPage = async (browser: Browser): Promise<Page> => {
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    return page;
};
export const getGameLiveByCategoryInfo = async (parentId: string) => {
    try {
        const requestUrl = `https://m.codere.com.co/NavigationService/Game/GetGamesLiveByCategoryInfo?parentid=${parentId}&categoryInfoId=99`;
        const { startTime, requestId } = logHttpRequest(requestUrl);
        const response = await axios.get(requestUrl);
        const requestDuration = Date.now() - startTime;
        logHttpResponse(response.status, requestDuration, requestUrl, requestId);

        const data = response.data;
        console.log(`📊 API Response Summary: Categories=${data.CategoryInfos?.length || 0}, Games=${data.Event?.Games?.length || 0}`);

        return data;
    } catch (error) {
        console.error(`Error fetching live game data for parentId ${parentId}:`, error);
        return null;
    }
};

// Get category-specific game data
export const getCategorySpecificMarkets = async (parentId: string, categoryId: string) => {
    try {
        const requestUrl = `https://m.codere.com.co/NavigationService/Game/GetGamesLiveByCategoryInfo?parentid=${parentId}&categoryInfoId=${categoryId}`;
        const { startTime, requestId } = logHttpRequest(requestUrl);
        const response = await axios.get(requestUrl);
        const requestDuration = Date.now() - startTime;
        logHttpResponse(response.status, requestDuration, requestUrl, requestId);

        const data = response.data;
        console.log(`📊 API Response Summary: Event=${!!data.Event}, Games=${data.Event?.Games?.length || 0}`);

        return data;
    } catch (error) {
        console.error(`Error fetching category-specific game data for parentId ${parentId}, categoryId ${categoryId}:`, error);
        return null;
    }
};
/**
 * Parses the proprietary date format from the API into a standard ISO string.
 * e.g., "/Date(1754899200000)/" -> "2025-08-14T10:00:00.000Z"
 */
const parseCodereDate = (dateStr: string): string => {
    const timestampMatch = dateStr.match(/\d+/);
    if (!timestampMatch) return new Date().toISOString();
    return new Date(parseInt(timestampMatch[0], 10)).toISOString();
};

/**
 * Transforms Codere Event objects to LiveEvent objects for consistent frontend interface
 */
const transformCodereEventsToLiveEvents = (events: CodereEvent[]): LiveEvent[] => {
    return events.map((event: CodereEvent) => ({
        api_name: 'codere',
        id: parseInt(event.NodeId, 10),
        sport_group: event.SportName,
        sport_category: event.CountryName,
        sport_title: event.LeagueName,
        home_team: event.ParticipantHome,
        away_team: event.ParticipantAway,
        commence_time: null, // Not available in this API response
        start_time: parseCodereDate(event.StartDate),
        status: event.isLive ? 'live' : 'not_started',
        match_time: null, // Not available for non-live events
        team1_score: 0, // Not available for non-live events
        team2_score: 0, // Not available for non-live events
        active: !event.Locked,
        bettingActive: !event.Locked,
        scores: {
            home: '0',
            away: '0',
            additionalScores: {
                home: [],
                away: []
            }
        },
        markets: event.Games?.map(game => ({
            name: game.Name,
            key: game.NodeId,
            outcomes: game.Results?.map(result => ({
                name: result.Name,
                price: result.Odd,
                point: result.GameSpecialOddsValue?.replace(/<Spov>|<\/Spov>/g, '') || '',
                suspended: result.Locked,
                oddChange: 0, // Not available in Codere API
            })) || [],
        })) || [],
        bookmakers: [], // Not applicable for this source
        marketsCount: event.ChildrenCount, // Number of available markets for this event
        liveData: null, // No live data for non-live events
    }));
};

/**
 * Transforms the new Codere API data format into the common CombinedData format.
 */
const transformNewData = (data: CodereLiveEventsResponse): CombinedData => {
    const sports: Sport[] = [];
    const liveEvents: LiveEvent[] = [];

    // Group events by sport to create Sports data
    const sportGroups = new Map<string, { sportName: string; events: NewCodereEvent[] }>();

    data.Events.forEach((event: NewCodereEvent) => {
        const sportHandle = event.SportHandle || 'unknown';
        const sportName = event.SportName || 'Unknown Sport';

        if (!sportGroups.has(sportHandle)) {
            sportGroups.set(sportHandle, { sportName, events: [] });
        }
        sportGroups.get(sportHandle)!.events.push(event);
    });

    // Create Sports from grouped events
    sportGroups.forEach((sportGroup, sportHandle) => {
        sports.push({
            key: sportHandle,
            group: sportGroup.sportName,
            title: sportGroup.sportName,
            description: `Live events for ${sportGroup.sportName}`,
            active: true,
            has_outrights: false,
        });
    });

    // Transform events to LiveEvent format
    data.Events.forEach((event: NewCodereEvent) => {
        const additionalScoresData = event.liveData?.Innings || event.liveData?.Sets || [];
        const additionalScores = {
            home: additionalScoresData.map(score => String(score[0])),
            away: additionalScoresData.map(score => String(score[1])),
        };

        // Process both DefaultGame and Games array to get all markets
        const markets: any[] = [];

        // Add DefaultGame if available
        if (event.DefaultGame?.Results) {
            markets.push({
                name: event.DefaultGame.Name || event.DefaultGame.ShortName || 'Default Market',
                key: event.DefaultGame.NodeId,
                outcomes: event.DefaultGame.Results.map(result => ({
                    name: result.Name,
                    price: result.Odd,
                    point: result.GameSpecialOddsValue?.replace(/<Spov>|<\/Spov>/g, '') || '',
                    suspended: result.Locked,
                    oddChange: 0,
                })),
            });
        }

        // Add all games from Games array (this is where most markets are!)
        if (event.Games && event.Games.length > 0) {
            event.Games.forEach(game => {
                if (game.Results && game.Results.length > 0) {
                    markets.push({
                        name: game.Name || game.ShortName || 'Market',
                        key: game.NodeId,
                        outcomes: game.Results.map(result => ({
                            name: result.Name,
                            price: result.Odd,
                            point: result.GameSpecialOddsValue?.replace(/<Spov>|<\/Spov>/g, '') || '',
                            suspended: result.Locked,
                            oddChange: 0,
                        })),
                    });
                }
            });
        }

        // Log market processing for debugging
        /*
        if (data.Events.indexOf(event) < 3) { // Only log first 3 events to avoid spam
            console.log(`🎲 Event ${event.NodeId} (${event.ParticipantHome} vs ${event.ParticipantAway}):`);
            console.log(`   - Markets count: ${markets.length}`);
            console.log(`   - DefaultGame available: ${!!event.DefaultGame}`);
            console.log(`   - Games array count: ${event.Games?.length || 0}`);
            if (event.DefaultGame) {
                console.log(`   - DefaultGame type: ${event.DefaultGame.Name}`);
                console.log(`   - Results count: ${event.DefaultGame.Results?.length || 0}`);
            }
            console.log(`   - Children count (total markets): ${event.ChildrenCount}`);
            console.log(`   - SmartMarketReferenceGameTypeIds: ${event.SmartMarketReferenceGameTypeIds?.substring(0, 100)}...`);
        }
        */
        // No additional fake stats - only use real API data from event.liveData
        // If the API doesn't provide specific stats, the frontend will show "NO DATA"

        liveEvents.push({
            api_name: 'codere',
            id: parseInt(event.NodeId, 10),
            sport_group: event.SportName || 'Unknown Sport',
            sport_category: event.CountryName,
            sport_title: event.LeagueName,
            league_logo: getLeagueLogoUrl(event.LeagueName, event.CountryCode),
            home_team: event.liveData?.ParticipantHome || event.ParticipantHome,
            away_team: event.liveData?.ParticipantAway || event.ParticipantAway,
            commence_time: event.liveData?.Time || '',
            start_time: parseCodereDate(event.StartDate),
            status: event.liveData?.PeriodName || (event.isLive ? 'live' : 'not_started'),
            match_time: String(event.liveData?.MatchTime || -1),
            team1_score: event.liveData?.ResultHome || 0,
            team2_score: event.liveData?.ResultAway || 0,
            active: event.isLive,
            bettingActive: !event.Locked,
            scores: {
                home: String(event.liveData?.ResultHome || 0),
                away: String(event.liveData?.ResultAway || 0),
                additionalScores: additionalScores,
            },
            markets: markets,
            bookmakers: [], // Not applicable for this source
            marketsCount: event.ChildrenCount, // Number of available markets for this event
            liveData: {
                ...event.liveData // Only use real API data
            },
        });
    });

    return { sports, liveEvents };
};

/**
 * Transforms the raw Codere API data into the common CombinedData format.
 * @deprecated This is for the old API format. Use transformNewData for the new format.
 */
const transformData = (data: CodereRoot): CombinedData => {
    const sports: Sport[] = [];
    const liveEvents: LiveEvent[] = [];

    data.LiveSport.forEach((sport: LiveSport) => {
        // 1. Transform Sport data based on user request
        sports.push({
            key: sport.SportId,
            group: sport.Name,
            title: sport.Name,
            description: `Live events for ${sport.Name}`,
            active: true,
            has_outrights: false,
        });

        // 2. Transform LiveEvent data for each event within the sport
        sport.Events.forEach((event: CodereEvent) => {
            const additionalScoresData = event.liveData.Innings || event.liveData.Sets || [];
            const additionalScores = {
                home: additionalScoresData.map(score => String(score[0])),
                away: additionalScoresData.map(score => String(score[1])),
            };

            liveEvents.push({
                api_name: 'codere',
                id: parseInt(event.NodeId, 10),
                sport_group: sport.Name,
                sport_category: event.CountryName,
                sport_title: event.LeagueName,
                home_team: event.liveData.ParticipantHome,
                away_team: event.liveData.ParticipantAway,
                commence_time: event.liveData.Time,
                start_time: parseCodereDate(event.StartDate),
                status: event.liveData.PeriodName,
                match_time: String(event.liveData.MatchTime),
                team1_score: event.liveData.ResultHome,
                team2_score: event.liveData.ResultAway,
                active: event.isLive,
                bettingActive: !event.Locked,
                scores: {
                    home: String(event.liveData.ResultHome),
                    away: String(event.liveData.ResultAway),
                    additionalScores: additionalScores,
                },
                markets: event.Games.map(game => ({
                    name: game.Name,
                    key: game.NodeId,
                    outcomes: game.Results.map(result => ({
                        name: result.Name,
                        price: result.Odd,
                        point: result.GameSpecialOddsValue.replace(/<Spov>|<\/Spov>/g, ''),
                        suspended: result.Locked,
                        oddChange: 0, // Not available in Codere API
                    })),
                })),
                bookmakers: [], // Not applicable for this source
                marketsCount: event.ChildrenCount, // Number of available markets for this event
                liveData: event.liveData, // Include raw live data for sport-specific statistics
            });
        });
    });

    return { sports, liveEvents };
};

/**
 * Fetches live data from the Codere API endpoint using sport-specific game types.
 */
const fetchLiveCodereData = async (browser: Browser): Promise<CombinedData | null> => {
    try {
        console.log(`🚀 Starting sport-specific live data fetch cycle`);
        
        // Use the new sport-specific events fetching approach
        const combinedData = await getSportSpecificLiveEvents();
        
        if (combinedData) {
            console.log(`⚽ Codere: Sport-specific fetch completed - ${combinedData.liveEvents.length} live events from ${combinedData.sports.length} sports`);
        } else {
            console.log(`⚠️ Codere: Sport-specific fetch returned no data`);
        }

        return combinedData;
    } catch (error) {
        console.error('❌ Codere: An error occurred during fetchLiveCodereData:', error);
        return null;
    }
};

// FIX: Added toggle logic for mock data
let mockToggle = false;

/**
 * Loads and transforms mock data using the sport-specific approach.
 */
const fetchMockCodereData = async (): Promise<CombinedData | null> => {
    try {
        console.log(`🔄 Codere: Loading mock data using sport-specific approach`);

        // Use the same sport-specific events fetching approach for consistency
        const combinedData = await getSportSpecificLiveEvents();
        
        if (combinedData) {
            console.log(`⚽ Codere Mock: Sport-specific approach - ${combinedData.liveEvents.length} live events from ${combinedData.sports.length} sports`);
        } else {
            console.log(`⚠️ Codere Mock: Sport-specific approach returned no data, falling back to basic mock`);
            
            // Fallback to basic mock transformation
            const data = mockLiveEventsBySportHandleData as CodereLiveEventsResponse;
            const transformed = transformNewData(data);
            transformed.codere = {
                leftMenu: mockLeftMenuData as CodereLeftMenuData
            };
            return transformed;
        }

        return combinedData;
    } catch (error) {
        console.error("❌ Codere: Failed to process mock data with sport-specific approach", error);
        
        // Fallback to basic mock transformation
        try {
            const data = mockLiveEventsBySportHandleData as CodereLiveEventsResponse;
            const transformed = transformNewData(data);
            transformed.codere = {
                leftMenu: mockLeftMenuData as CodereLeftMenuData
            };
            return transformed;
        } catch (fallbackError) {
            console.error("❌ Codere: Fallback mock processing also failed", fallbackError);
            return null;
        }
    }
};

/**
 * Gets the available market types (game types) for each sport that has live events
 * @param clientId The client ID requesting the data
 * @param callback Optional callback to execute when data updates
 * @returns Object with sport handles as keys and their available game types as values
 */
export const subscribeToSportMarketTypes = (
    clientId: string,
    callback?: (data: Record<string, any> | null) => void
): Record<string, any> | null => {
    const endpoint = 'sportMarketTypes';

    const fetcher = async (): Promise<Record<string, any> | null> => {
        try {
            console.log(`🎯 Fetching market types for all live sports`);

            // First get the basic live events to identify available sports
            let liveEventsData: CodereLiveEventsResponse;

            if (process.env.USE_MOCK_DATA === 'true') {
                liveEventsData = mockLiveEventsBySportHandleData as CodereLiveEventsResponse;
            } else {
                const requestStartTime = Date.now();
                console.log(`🌐 [HTTP REQUEST] GET ${URLS.liveEvents}`);
                const response = await axios.get(URLS.liveEvents);
                const requestDuration = Date.now() - requestStartTime;
                console.log(`✅ [HTTP RESPONSE] Status: ${response.status} | Duration: ${requestDuration}ms | URL: ${URLS.liveEvents}`);
                liveEventsData = response.data as CodereLiveEventsResponse;
            }

            if (!liveEventsData || !liveEventsData.SportHandleList) {
                console.log(`⚠️ No sport handles available`);
                return {};
            }

            const sportMarketTypes: Record<string, any> = {};

            // For each available sport handle, fetch its specific events with game types
            for (const sportHandle of liveEventsData.SportHandleList) {
                try {
                    console.log(`🔍 Fetching market types for sport: ${sportHandle}`);

                    let sportSpecificData: CodereLiveEventsResponse;

                    if (process.env.USE_MOCK_DATA === 'true') {
                        // Use mock data for all sports
                        sportSpecificData = mockLiveEventsBySportHandleData as CodereLiveEventsResponse;
                    } else {
                        // Fetch sport-specific events with game types
                        const gameTypes = getSportGameTypes(sportHandle);
                        const url = `${URLS.liveEventsBySportHandle}${sportHandle}&gametypes=${gameTypes}`;
                        const requestStartTime = Date.now();
                        console.log(`🌐 [HTTP REQUEST] GET ${url}`);
                        const response = await axios.get(url);
                        const requestDuration = Date.now() - requestStartTime;
                        console.log(`✅ [HTTP RESPONSE] Status: ${response.status} | Duration: ${requestDuration}ms | URL: ${url}`);
                        sportSpecificData = response.data as CodereLiveEventsResponse;
                    }

                    if (sportSpecificData && sportSpecificData.Events && sportSpecificData.Events.length > 0) {
                        // Collect unique game types for this sport
                        const gameTypesMap = new Map<string, {
                            id: string;
                            name: string;
                            count: number;
                        }>();

                        sportSpecificData.Events.forEach(event => {
                            // Get game types from DefaultGame
                            if (event.DefaultGame) {
                                const gameTypeId = event.DefaultGame.NodeId;
                                const gameTypeName = event.DefaultGame.Name || event.DefaultGame.ShortName || 'Main Market';

                                if (gameTypesMap.has(gameTypeId)) {
                                    gameTypesMap.get(gameTypeId)!.count++;
                                } else {
                                    gameTypesMap.set(gameTypeId, {
                                        id: gameTypeId,
                                        name: gameTypeName,
                                        count: 1
                                    });
                                }
                            }

                            // Get game types from additional Games
                            if (event.Games && event.Games.length > 0) {
                                event.Games.forEach(game => {
                                    const gameTypeId = game.NodeId;
                                    const gameTypeName = game.Name || 'Market';

                                    if (gameTypesMap.has(gameTypeId)) {
                                        gameTypesMap.get(gameTypeId)!.count++;
                                    } else {
                                        gameTypesMap.set(gameTypeId, {
                                            id: gameTypeId,
                                            name: gameTypeName,
                                            count: 1
                                        });
                                    }
                                });
                            }
                        });

                        // Get the sport name from the first event
                        const sportName = sportSpecificData.Events[0]?.SportName || sportHandle;

                        // Sort game types by frequency and take top ones
                        const sortedGameTypes = Array.from(gameTypesMap.values())
                            .sort((a, b) => b.count - a.count);

                        sportMarketTypes[sportHandle] = {
                            sportName: sportName,
                            sportHandle: sportHandle,
                            eventsCount: sportSpecificData.Events.length,
                            gameTypes: sortedGameTypes.map(gt => ({
                                id: gt.id,
                                name: gt.name,
                                eventsCount: gt.count
                            }))
                        };

                        console.log(`✅ ${sportName}: Found ${sortedGameTypes.length} game types from ${sportSpecificData.Events.length} events`);
                    }
                } catch (sportError) {
                    console.error(`❌ Error fetching market types for sport ${sportHandle}:`, sportError);
                    // Continue with other sports even if one fails
                }
            }

            console.log(`🎯 Completed fetching market types for ${Object.keys(sportMarketTypes).length} sports`);
            return sportMarketTypes;

        } catch (error) {
            console.error(`❌ Error fetching sport market types:`, error);
            return null;
        }
    };

    // Use 30 second cache duration for market types (30000ms)
    return cacheManager.subscribe(endpoint, clientId, fetcher, callback, 30000);
};

/**
 * Unsubscribe from sport market types data
 */
export const unsubscribeFromSportMarketTypes = (clientId: string): void => {
    const endpoint = 'sportMarketTypes';
    cacheManager.unsubscribe(endpoint, clientId);
};

/**
 * Subscribe to live event market categories using sport handle and market types.
 * @param sportHandle The sport handle (e.g., 'soccer', 'basketball').
 * @param clientId The client ID requesting the data.
 * @param callback Optional callback to execute when data updates.
 * @returns The cached market categories or null if not available.
 */
export const subscribeToLiveEventMarketCategories = (sportHandle: string, clientId: string, callback?: (data: any[] | null) => void): any[] | null => {
    const endpoint = `liveEventMarketCategories_${sportHandle}`;

    const fetcher = async (): Promise<any[] | null> => {
        try {
            console.log(`🔍 BACKEND DEBUG - Fetching market categories for live events in sport: ${sportHandle}`);

            // First get live events data to extract market types
            let liveEventsData: CodereLiveEventsResponse;

            if (process.env.USE_MOCK_DATA === 'true') {
                liveEventsData = mockLiveEventsBySportHandleData as CodereLiveEventsResponse;
            } else {
                const gameTypes = getSportGameTypes(sportHandle);
                const url = `${URLS.liveEventsBySportHandle}${sportHandle}&gametypes=${gameTypes}`;
                const requestStartTime = Date.now();
                console.log(`🌐 [HTTP REQUEST] GET ${url}`);
                const response = await axios.get(url);
                const requestDuration = Date.now() - requestStartTime;
                console.log(`✅ [HTTP RESPONSE] Status: ${response.status} | Duration: ${requestDuration}ms | URL: ${url}`);
                liveEventsData = response.data as CodereLiveEventsResponse;
            }

            if (!liveEventsData || !liveEventsData.Events) {
                console.log(`⚠️ No live events data available for sport: ${sportHandle}`);
                return [];
            }

            // Extract unique market categories from live events in this sport
            const marketCategoriesMap = new Map<string, {
                id: string;
                name: string;
                count: number;
                type: string;
            }>();

            liveEventsData.Events.forEach((event: NewCodereEvent) => {
                if (event.SportHandle === sportHandle) {
                    // Process DefaultGame markets
                    if (event.DefaultGame?.Results) {
                        const categoryKey = event.DefaultGame.NodeId;
                        const categoryName = event.DefaultGame.Name || event.DefaultGame.ShortName || 'Default Market';

                        if (marketCategoriesMap.has(categoryKey)) {
                            marketCategoriesMap.get(categoryKey)!.count++;
                        } else {
                            marketCategoriesMap.set(categoryKey, {
                                id: categoryKey,
                                name: categoryName,
                                count: 1,
                                type: 'default'
                            });
                        }
                    }

                    // Process additional Games markets
                    if (event.Games && event.Games.length > 0) {
                        event.Games.forEach(game => {
                            if (game.Results && game.Results.length > 0) {
                                const categoryKey = game.NodeId;
                                const categoryName = game.Name;

                                if (marketCategoriesMap.has(categoryKey)) {
                                    marketCategoriesMap.get(categoryKey)!.count++;
                                } else {
                                    marketCategoriesMap.set(categoryKey, {
                                        id: categoryKey,
                                        name: categoryName,
                                        count: 1,
                                        type: 'additional'
                                    });
                                }
                            }
                        });
                    }
                }
            });

            // Convert to array and sort by count (most popular first)
            const marketCategories = Array.from(marketCategoriesMap.values())
                .sort((a, b) => b.count - a.count);

            console.log(`🔍 BACKEND DEBUG - Found ${marketCategories.length} market categories for sport ${sportHandle}`);
            return marketCategories;

        } catch (error) {
            console.error(`❌ BACKEND ERROR - Error fetching market categories for sport ${sportHandle}:`, error);
            return null;
        }
    };

    // Use 30 second cache duration for market categories (30000ms)
    return cacheManager.subscribe(endpoint, clientId, fetcher, callback, 30000);
};

/**
 * Unsubscribe from live event market categories for a specific sport
 */
export const unsubscribeFromLiveEventMarketCategories = (sportHandle: string, clientId: string): void => {
    const endpoint = `liveEventMarketCategories_${sportHandle}`;
    cacheManager.unsubscribe(endpoint, clientId);
};

/**
 * Subscribe to live events with specific market category.
 * @param sportHandle The sport handle (e.g., 'soccer', 'basketball').
 * @param marketCategoryId The market category ID to filter by.
 * @param clientId The client ID requesting the data.
 * @param callback Optional callback to execute when data updates.
 * @returns The cached live events with markets or null if not available.
 */
export const subscribeToLiveEventsWithMarketCategory = (
    sportHandle: string,
    marketCategoryId: string,
    clientId: string,
    callback?: (data: LiveEvent[] | null) => void
): LiveEvent[] | null => {
    const endpoint = `liveEventsWithMarket_${sportHandle}_${marketCategoryId}`;

    const fetcher = async (): Promise<LiveEvent[] | null> => {
        try {
            console.log(`🔍 BACKEND DEBUG - Fetching live events with market category ${marketCategoryId} for sport: ${sportHandle}`);

            // Get live events data
            let liveEventsData: CodereLiveEventsResponse;

            if (process.env.USE_MOCK_DATA === 'true') {
                liveEventsData = mockLiveEventsBySportHandleData as CodereLiveEventsResponse;
            } else {
                const gameTypes = getSportGameTypes(sportHandle);
                const url = `${URLS.liveEventsBySportHandle}${sportHandle}&gametypes=${gameTypes}`;
                const requestStartTime = Date.now();
                console.log(`🌐 [HTTP REQUEST] GET ${url}`);
                const response = await axios.get(url);
                const requestDuration = Date.now() - requestStartTime;
                console.log(`✅ [HTTP RESPONSE] Status: ${response.status} | Duration: ${requestDuration}ms | URL: ${url}`);
                liveEventsData = response.data as CodereLiveEventsResponse;
            }

            if (!liveEventsData || !liveEventsData.Events) {
                console.log(`⚠️ No live events data available for sport: ${sportHandle}`);
                return [];
            }

            // Filter events for this sport and transform them
            const filteredEvents = liveEventsData.Events.filter((event: NewCodereEvent) =>
                event.SportHandle === sportHandle
            );

            const liveEvents = transformNewEventsToLiveEvents(filteredEvents);

            // Filter markets to only include the requested category
            const filteredLiveEvents = liveEvents.map(event => {
                const filteredMarkets = event.markets.filter(market =>
                    market.key === marketCategoryId
                );

                return {
                    ...event,
                    markets: filteredMarkets
                };
            }).filter(event => event.markets.length > 0); // Only include events that have the requested market

            console.log(`🔍 BACKEND DEBUG - Filtered to ${filteredLiveEvents.length} events with market category ${marketCategoryId}`);
            return filteredLiveEvents;

        } catch (error) {
            console.error(`❌ BACKEND ERROR - Error fetching live events with market category ${marketCategoryId} for sport ${sportHandle}:`, error);
            return null;
        }
    };

    // Use 10 second cache duration for live events with markets (10000ms)
    return cacheManager.subscribe(endpoint, clientId, fetcher, callback, 10000);
};

/**
 * Unsubscribe from live events with specific market category
 */
export const unsubscribeFromLiveEventsWithMarketCategory = (sportHandle: string, marketCategoryId: string, clientId: string): void => {
    const endpoint = `liveEventsWithMarket_${sportHandle}_${marketCategoryId}`;
    cacheManager.unsubscribe(endpoint, clientId);
};

/**
 * Helper function to transform new API events to LiveEvent format
 */
const transformNewEventsToLiveEvents = (events: NewCodereEvent[]): LiveEvent[] => {
    return events.map((event: NewCodereEvent) => {
        const additionalScoresData = event.liveData?.Innings || event.liveData?.Sets || [];
        const additionalScores = {
            home: additionalScoresData.map(score => String(score[0])),
            away: additionalScoresData.map(score => String(score[1])),
        };

        // Combine DefaultGame and additional Games into markets
        const markets: any[] = [];

        // Add DefaultGame as a market
        if (event.DefaultGame?.Results) {
            markets.push({
                name: event.DefaultGame.Name || event.DefaultGame.ShortName || 'Default Market',
                key: event.DefaultGame.NodeId,
                outcomes: event.DefaultGame.Results.map(result => ({
                    name: result.Name,
                    price: result.Odd,
                    point: result.GameSpecialOddsValue?.replace(/<Spov>|<\/Spov>/g, '') || '',
                    suspended: result.Locked,
                    oddChange: 0,
                })),
            });
        }

        // Add additional Games as markets
        if (event.Games && event.Games.length > 0) {
            event.Games.forEach(game => {
                if (game.Results && game.Results.length > 0) {
                    markets.push({
                        name: game.Name,
                        key: game.NodeId,
                        outcomes: game.Results.map(result => ({
                            name: result.Name,
                            price: result.Odd,
                            point: result.GameSpecialOddsValue?.replace(/<Spov>|<\/Spov>/g, '') || '',
                            suspended: result.Locked,
                            oddChange: 0,
                        })),
                    });
                }
            });
        }

        // No additional fake stats - only use real API data from event.liveData
        // If the API doesn't provide specific stats, the frontend will show "NO DATA"

        return {
            api_name: 'codere',
            id: parseInt(event.NodeId, 10),
            sport_group: event.SportName || 'Unknown Sport',
            sport_category: event.CountryName,
            sport_title: event.LeagueName,
            league_logo: getLeagueLogoUrl(event.LeagueName, event.CountryCode),
            home_team: event.liveData?.ParticipantHome || event.ParticipantHome,
            away_team: event.liveData?.ParticipantAway || event.ParticipantAway,
            commence_time: event.liveData?.Time || '',
            start_time: parseCodereDate(event.StartDate),
            status: event.liveData?.PeriodName || (event.isLive ? 'live' : 'not_started'),
            match_time: String(event.liveData?.MatchTime || -1),
            team1_score: event.liveData?.ResultHome || 0,
            team2_score: event.liveData?.ResultAway || 0,
            active: event.isLive,
            bettingActive: !event.Locked,
            scores: {
                home: String(event.liveData?.ResultHome || 0),
                away: String(event.liveData?.ResultAway || 0),
                additionalScores: additionalScores,
            },
            markets: markets,
            bookmakers: [],
            marketsCount: event.ChildrenCount,
            liveData: {
                ...event.liveData // Only use real API data
            },
        };
    });
};

// Cache for logo URLs to prevent redundant generation
const leagueLogoUrlCache = new Map<string, string | null>();

/**
 * Generate league logo URL based on league name and country code from Codere
 * Uses local caching when available, falls back to original URL
 */
function getLeagueLogoUrl(leagueName: string | undefined, countryCode: string | undefined): string | null {
    // Create cache key
    const cacheKey = `${leagueName || 'undefined'}_${countryCode || 'undefined'}`;

    // Check cache first
    if (leagueLogoUrlCache.has(cacheKey)) {
        return leagueLogoUrlCache.get(cacheKey)!;
    }

    if (!leagueName && !countryCode) {
        //console.log(`🔍 LEAGUE LOGO DEBUG - No league name or country code provided`);
        leagueLogoUrlCache.set(cacheKey, null);
        return null;
    }

    // Create a mapping for common league/country identifiers
    let identifier = '';

    // Use CountryCode if available
    if (countryCode && countryCode !== '-1') {
        identifier = countryCode;
        // console.log(`🔍 LEAGUE LOGO DEBUG - Using country code: ${countryCode}`);
    }
    // Or derive from league name for special cases
    else if (leagueName) {
        const leagueLower = leagueName.toLowerCase();
        // console.log(`🔍 LEAGUE LOGO DEBUG - Processing league: ${leagueName}`);

        // Map specific leagues to their icon identifiers
        if (leagueLower.includes('wta') || leagueLower.includes('women')) {
            identifier = 'WTA1';
        } else if (leagueLower.includes('al ain') || leagueLower.includes('master de al ain') || leagueLower.includes('masters de al ain')) {
            identifier = 'AE'; // UAE flag for Al Ain tournaments
        } else if (leagueLower.includes('atp') || leagueLower.includes('masters')) {
            identifier = 'ATP1';
        } else if (leagueLower.includes('champions league') || leagueLower.includes('uefa')) {
            identifier = 'UEFA1';
        } else if (leagueLower.includes('nba')) {
            identifier = 'NBA2';
        } else if (leagueLower.includes('liga pro')) {
            identifier = 'CZ'; // República Checa based on mock data
        } else if (leagueLower.includes('npb')) {
            identifier = 'JP'; // Japan based on mock data
        } else {
            // Default fallback - use first two characters of league name
            identifier = leagueName.substring(0, 2).toUpperCase();
        }
        //console.log(`🔍 LEAGUE LOGO DEBUG - Mapped to identifier: ${identifier}`);
    }

    if (!identifier) {
        // console.log(`🔍 LEAGUE LOGO DEBUG - No identifier generated`);
        leagueLogoUrlCache.set(cacheKey, null);
        return null;
    }

    // Generate the original Codere URL
    const originalUrl = `https://m.codere.com.co/deportesCol/assets/global/img/banderas/ICO_${identifier}.png`;
    //console.log(`🔍 LEAGUE LOGO DEBUG - Generated URL: ${originalUrl}`);

    // Cache the result
    leagueLogoUrlCache.set(cacheKey, originalUrl);

    // Trigger background caching (fire and forget)
    leagueLogoCache.getLogoPath(identifier, originalUrl).catch(() => {
        // Silently handle caching errors
    });

    // Return the original URL (caching happens in background)
    return originalUrl;
}

/**
 * The main data source object that conforms to the IDataSource interface.
 */
const CodereDataSource: IDataSource = {
    name: 'codere',
    fetchData: async (browser: Browser | null): Promise<CombinedData | null> => {
        if (process.env.USE_MOCK_DATA === 'true') {
            return await fetchMockCodereData();
        }

        if (!browser) {
            console.error("Codere: Browser instance is required for live scraping.");
            return null;
        }

        return await fetchLiveCodereData(browser);
    }
};

export default CodereDataSource;
