import { Browser } from 'puppeteer';
import { broadcastSubscriptionUpdate, sendImmediateResponse, getWatchedMatches } from '../common/websocketServer';
import { CombinedData } from '../common/commonTypes';
import { IDataSource } from './IDataSource';
import { 
    getGameLiveByCategoryInfo, 
    getLeagues, 
    getLeagueEvents,
    subscribeToLeagues,
    unsubscribeFromLeagues,
    subscribeToLeagueEvents,
    unsubscribeFromLeagueEvents,
    subscribeToLeagueCategories,
    unsubscribeFromLeagueCategories,
    subscribeToLeagueEventsWithGames,
    unsubscribeFromLeagueEventsWithGames,
    subscribeToLeftMenu,
    unsubscribeFromLeftMenu,
    subscribeToMatchCategories,
    unsubscribeFromMatchCategories,
    subscribeToMatchGames,
    unsubscribeFromMatchGames,
    subscribeToLiveEventMarketCategories,
    unsubscribeFromLiveEventMarketCategories,
    subscribeToLiveEventsWithMarketCategory,
    unsubscribeFromLiveEventsWithMarketCategory,
    getHttpRequestStats,
    resetHttpRequestStats
} from './codere';
import { getLuckiaHttpRequestStats, resetLuckiaHttpRequestStats } from './luckia';
import { appEmitter } from '../common/events';

// External API Request Monitoring System
interface ApiMonitoringStats {
    codere: {
        totalRequests: number;
        endpointSummary: Record<string, any>;
        lastUpdated: number;
    };
    luckia: {
        totalRequests: number;
        endpointSummary: Record<string, any>;
        lastUpdated: number;
    };
    combined: {
        totalRequests: number;
        requestsPerMinute: number;
        topEndpoints: Array<{ endpoint: string; count: number; source: string }>;
        lastUpdated: number;
    };
}

// Function to get comprehensive external API monitoring stats
export const getExternalApiStats = (): ApiMonitoringStats => {
    const codereStats = getHttpRequestStats();
    const luckiaStats = getLuckiaHttpRequestStats();
    
    // Combine top endpoints from both sources
    const allEndpoints: Array<{ endpoint: string; count: number; source: string }> = [];
    
    Object.entries(codereStats.endpointSummary).forEach(([endpoint, stats]) => {
        allEndpoints.push({ endpoint, count: stats.count, source: 'codere' });
    });
    
    Object.entries(luckiaStats.endpointSummary).forEach(([endpoint, stats]) => {
        allEndpoints.push({ endpoint, count: stats.count, source: 'luckia' });
    });
    
    // Sort by count and get top 10
    const topEndpoints = allEndpoints
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    
    const totalRequests = codereStats.totalRequests + luckiaStats.totalRequests;
    
    return {
        codere: codereStats,
        luckia: luckiaStats,
        combined: {
            totalRequests,
            requestsPerMinute: Math.round(totalRequests / ((Date.now() - Math.min(codereStats.lastUpdated, luckiaStats.lastUpdated)) / 60000) || 0),
            topEndpoints,
            lastUpdated: Date.now()
        }
    };
};

// Function to reset all external API tracking stats
export const resetAllApiStats = () => {
    resetHttpRequestStats();
    resetLuckiaHttpRequestStats();
    console.log(`🔄 [API MONITORING] All external API statistics reset`);
};

// Log API monitoring summary every 5 minutes
setInterval(() => {
    const stats = getExternalApiStats();
    console.log(`\n📊 [API MONITORING SUMMARY] ${new Date().toISOString()}`);
    console.log(`🌐 Total External Requests: ${stats.combined.totalRequests}`);
    console.log(`📈 Requests per minute: ${stats.combined.requestsPerMinute}`);
    console.log(`🟦 Codere: ${stats.codere.totalRequests} requests`);
    console.log(`🟡 Luckia: ${stats.luckia.totalRequests} requests`);
    console.log(`🔝 Top endpoints:`);
    stats.combined.topEndpoints.slice(0, 5).forEach((endpoint, i) => {
        console.log(`   ${i + 1}. [${endpoint.source.toUpperCase()}] ${endpoint.endpoint}: ${endpoint.count} calls`);
    });
    console.log(`📊 [API MONITORING SUMMARY] End\n`);
}, 5 * 60 * 1000); // 5 minutes

let latestData: CombinedData = { sports: [], liveEvents: [] };

export const getLatestData = () => latestData;

// Helper function to update latestData structure without immediate broadcasting
const updateCodereDataStructure = (dataType: 'leagues' | 'leagueEvents', data: any, identifier: string) => {
    if (!latestData.codere) {
        latestData.codere = {};
    }
    
    switch (dataType) {
        case 'leagues':
            if (latestData.codere.leftMenu?.sports) {
                const sportIndex = latestData.codere.leftMenu.sports.findIndex(s => s.NodeId === identifier);
                if (sportIndex > -1) {
                    latestData.codere.leftMenu.sports[sportIndex].Submenu = data;
                    console.log(`📝 Updated leagues structure for sport (${identifier})`);
                }
            }
            break;
        case 'leagueEvents':
            if (latestData.codere.leftMenu) {
                for (const sport of latestData.codere.leftMenu.sports) {
                    if (sport.Submenu) {
                        for (const country of sport.Submenu.countries) {
                            const leagueIndex = country.Leagues.findIndex(l => l.NodeId === identifier);
                            if (leagueIndex > -1) {
                                country.Leagues[leagueIndex].Events = data;
                                console.log(`📝 Updated events structure for league (${identifier})`);
                                return; // Exit early once found
                            }
                        }
                    }
                }
            }
            break;
    }
};

// Set up event listeners for WebSocket actions with consolidated batching approach
appEmitter.on('subscribeLeagues', (nodeId: string, clientId: string) => {
    // Use callback that updates data structure and queues for batching
    const callback = (data: any) => {
        updateCodereDataStructure('leagues', data, nodeId);
        // Queue league-specific update for batching
        broadcastSubscriptionUpdate(`leagues_${nodeId}`, {
            type: 'leagues',
            nodeId: nodeId,
            data: data
        });
        console.log(`📦 Queued leagues update for sport ${nodeId}`);
    };
    
    const leagues = subscribeToLeagues(nodeId, clientId, callback);
    if (leagues) {
        updateCodereDataStructure('leagues', leagues, nodeId);
        // Queue immediate data if available
        broadcastSubscriptionUpdate(`leagues_${nodeId}`, {
            type: 'leagues',
            nodeId: nodeId,
            data: leagues
        });
        console.log(`📦 Queued immediate leagues data for sport ${nodeId}`);
    }
});

appEmitter.on('unsubscribeLeagues', (nodeId: string, clientId: string) => {
    unsubscribeFromLeagues(nodeId, clientId);
});

appEmitter.on('subscribeLeagueEvents', (leagueNodeId: string, clientId: string, ws?: any) => {
    // Use callback that updates data structure and queues for batching
    const callback = (events: any) => {
        updateCodereDataStructure('leagueEvents', events, leagueNodeId);
        // Queue league events update for batching
        broadcastSubscriptionUpdate(`leagueEvents_${leagueNodeId}`, {
            type: 'leagueEvents',
            leagueNodeId: leagueNodeId,
            data: events
        });
        console.log(`📦 Queued league events update for league ${leagueNodeId}: ${events?.length || 0} events`);
    };
    
    const events = subscribeToLeagueEvents(leagueNodeId, clientId, callback);
    if (events) {
        updateCodereDataStructure('leagueEvents', events, leagueNodeId);
        
        // Send immediate response to the requesting client only
        if (ws && ws.readyState === 1) {
            sendImmediateResponse(ws, {
                type: 'leagueEvents',
                leagueNodeId: leagueNodeId,
                data: events,
                timestamp: Date.now()
            });
            console.log(`⚡ Sent immediate league events response: ${events.length} events for league ${leagueNodeId}`);
        }
        
        // Queue for batched broadcast to all clients
        broadcastSubscriptionUpdate(`leagueEvents_${leagueNodeId}`, {
            type: 'leagueEvents',
            leagueNodeId: leagueNodeId,
            data: events
        });
        console.log(`📦 Queued league events update for batching: league ${leagueNodeId}`);
    }
    
    // Auto-subscribe to enhanced events with games
    console.log(`🎯 Auto-subscribing to enhanced events with games for league ${leagueNodeId}`);
    const enhancedCallback = (eventsWithGames: any) => {
        console.log(`� Queueing enhanced events with games for league ${leagueNodeId}: ${eventsWithGames?.length || 0} events`);
        
        // Queue enhanced events for batching
        broadcastSubscriptionUpdate(`enhancedEvents_${leagueNodeId}`, {
            type: 'leagueEventsWithGames',
            leagueNodeId: leagueNodeId,
            data: eventsWithGames
        });
    };
    
    const enhancedEvents = subscribeToLeagueEventsWithGames(leagueNodeId, clientId, enhancedCallback);
    if (enhancedEvents) {
        // Send immediate enhanced events to requesting client
        if (ws && ws.readyState === 1) {
            sendImmediateResponse(ws, {
                type: 'leagueEventsWithGames',
                leagueNodeId: leagueNodeId,
                data: enhancedEvents,
                timestamp: Date.now()
            });
            console.log(`⚡ Sent immediate enhanced events: ${enhancedEvents.length} events for league ${leagueNodeId}`);
        }
        
        // Queue for batched broadcast
        broadcastSubscriptionUpdate(`enhancedEvents_${leagueNodeId}`, {
            type: 'leagueEventsWithGames',
            leagueNodeId: leagueNodeId,
            data: enhancedEvents
        });
    }
});

appEmitter.on('unsubscribeLeagueEvents', (leagueNodeId: string, clientId: string) => {
    unsubscribeFromLeagueEvents(leagueNodeId, clientId);
    console.log(`🎯 Auto-unsubscribing from enhanced events with games for league ${leagueNodeId}`);
    unsubscribeFromLeagueEventsWithGames(leagueNodeId, clientId);
});

appEmitter.on('subscribeLeagueCategories', (leagueNodeId: string, clientId: string, ws?: any) => {
    const callback = (categories: any) => {
        // Queue categories update for batching
        broadcastSubscriptionUpdate(`categories_${leagueNodeId}`, {
            type: 'leagueCategories',
            leagueNodeId: leagueNodeId,
            data: categories
        });
        console.log(`📦 Queued categories update for league ${leagueNodeId}: ${categories?.length || 0} categories`);
    };
    
    const categories = subscribeToLeagueCategories(leagueNodeId, clientId, callback);
    if (categories) {
        // Send immediate response to requesting client
        if (ws && ws.readyState === 1) {
            sendImmediateResponse(ws, {
                type: 'leagueCategories',
                leagueNodeId: leagueNodeId,
                data: categories,
                timestamp: Date.now()
            });
            console.log(`⚡ Sent immediate categories response: ${categories.length} categories for league ${leagueNodeId}`);
        }
        
        // Queue for batched broadcast
        broadcastSubscriptionUpdate(`categories_${leagueNodeId}`, {
            type: 'leagueCategories',
            leagueNodeId: leagueNodeId,
            data: categories
        });
    }
});

appEmitter.on('unsubscribeLeagueCategories', (leagueNodeId: string, clientId: string) => {
    unsubscribeFromLeagueCategories(leagueNodeId, clientId);
});

appEmitter.on('subscribeLeagueEventsWithGames', (leagueNodeId: string, clientId: string, ws?: any) => {
    const callback = (eventsWithGames: any) => {
        // Queue enhanced events update for batching
        broadcastSubscriptionUpdate(`enhancedEvents_${leagueNodeId}`, {
            type: 'leagueEventsWithGames',
            leagueNodeId: leagueNodeId,
            data: eventsWithGames
        });
        console.log(`📦 Queued enhanced events update for league ${leagueNodeId}: ${eventsWithGames?.length || 0} events`);
    };
    
    const eventsWithGames = subscribeToLeagueEventsWithGames(leagueNodeId, clientId, callback);
    if (eventsWithGames) {
        // Send immediate response to requesting client
        if (ws && ws.readyState === 1) {
            sendImmediateResponse(ws, {
                type: 'leagueEventsWithGames',
                leagueNodeId: leagueNodeId,
                data: eventsWithGames,
                timestamp: Date.now()
            });
            console.log(`⚡ Sent immediate enhanced events response: ${eventsWithGames.length} events for league ${leagueNodeId}`);
        }
        
        // Queue for batched broadcast
        broadcastSubscriptionUpdate(`enhancedEvents_${leagueNodeId}`, {
            type: 'leagueEventsWithGames',
            leagueNodeId: leagueNodeId,
            data: eventsWithGames
        });
    }
});

appEmitter.on('unsubscribeLeagueEventsWithGames', (leagueNodeId: string, clientId: string) => {
    unsubscribeFromLeagueEventsWithGames(leagueNodeId, clientId);
});

// Match-specific event listeners with batching
appEmitter.on('subscribeMatchCategories', (matchId: string, clientId: string, ws?: any) => {
    const callback = (categories: any) => {
        // Queue match categories update for batching
        broadcastSubscriptionUpdate(`matchCategories_${matchId}`, {
            type: 'matchCategories',
            matchId: matchId,
            data: categories
        });
        console.log(`📦 Queued match categories update for match ${matchId}: ${categories?.length || 0} categories`);
    };
    
    const categories = subscribeToMatchCategories(matchId, clientId, callback);
    if (categories) {
        // Send immediate response to requesting client
        if (ws && ws.readyState === 1) {
            sendImmediateResponse(ws, {
                type: 'matchCategories',
                matchId: matchId,
                data: categories,
                timestamp: Date.now()
            });
            console.log(`⚡ Sent immediate match categories response: ${categories.length} categories for match ${matchId}`);
        }
        
        // Queue for batched broadcast
        broadcastSubscriptionUpdate(`matchCategories_${matchId}`, {
            type: 'matchCategories',
            matchId: matchId,
            data: categories
        });
    }
});

appEmitter.on('unsubscribeMatchCategories', (matchId: string, clientId: string) => {
    unsubscribeFromMatchCategories(matchId, clientId);
});

appEmitter.on('subscribeMatchGames', (matchId: string, categoryId: string, clientId: string, ws?: any) => {
    const callback = (games: any) => {
        // Queue match games update for batching
        broadcastSubscriptionUpdate(`matchGames_${matchId}_${categoryId}`, {
            type: 'matchGames',
            matchId: matchId,
            categoryId: categoryId,
            data: games
        });
        console.log(`📦 Queued match games update for match ${matchId}, category ${categoryId}`);
    };
    
    const games = subscribeToMatchGames(matchId, categoryId, clientId, callback);
    if (games) {
        // Send immediate response to requesting client
        if (ws && ws.readyState === 1) {
            sendImmediateResponse(ws, {
                type: 'matchGames',
                matchId: matchId,
                categoryId: categoryId,
                data: games,
                timestamp: Date.now()
            });
            console.log(`⚡ Sent immediate match games response for match ${matchId}, category ${categoryId}`);
        }
        
        // Queue for batched broadcast
        broadcastSubscriptionUpdate(`matchGames_${matchId}_${categoryId}`, {
            type: 'matchGames',
            matchId: matchId,
            categoryId: categoryId,
            data: games
        });
    }
});

appEmitter.on('unsubscribeMatchGames', (matchId: string, categoryId: string, clientId: string) => {
    unsubscribeFromMatchGames(matchId, categoryId, clientId);
});

// Live events by sport handle event listeners with batching (5-second polling)
appEmitter.on('subscribeLiveEventsBySportHandle', (sportHandle: string, gameTypes: number[], clientId: string, ws?: any) => {
    const callback = (liveEventsData: any) => {
        // Queue live events by sport handle update for batching
        const gameTypesStr = gameTypes.join(';');
        broadcastSubscriptionUpdate(`liveEventsBySportHandle_${sportHandle}_${gameTypesStr}`, {
            type: 'liveEventsBySportHandle',
            sportHandle: sportHandle,
            gameTypes: gameTypes,
            data: liveEventsData
        });
        console.log(`📦 Queued live events update for ${sportHandle} (gameTypes: ${gameTypesStr}): ${liveEventsData?.Events?.length || 0} events`);
    };
    
    // Get market categories for this sport first
    const marketCategories = subscribeToLiveEventMarketCategories(sportHandle, clientId, (categories) => {
        if (categories && categories.length > 0) {
            // For simplified implementation, just return the first category's events
            const firstCategory = categories[0];
            const events = subscribeToLiveEventsWithMarketCategory(sportHandle, firstCategory.id, clientId, callback);
        }
    });
    const liveEventsData = marketCategories ? { SportHandleList: [sportHandle], Events: [], marketCategories } : null;
    if (liveEventsData) {
        // Send immediate response to requesting client
        if (ws && ws.readyState === 1) {
            sendImmediateResponse(ws, {
                type: 'liveEventsBySportHandle',
                sportHandle: sportHandle,
                gameTypes: gameTypes,
                data: liveEventsData,
                timestamp: Date.now()
            });
            console.log(`⚡ Sent immediate live events response: ${liveEventsData.Events?.length || 0} events for ${sportHandle}`);
        }
        
        // Queue for batched broadcast
        const gameTypesStr = gameTypes.join(';');
        broadcastSubscriptionUpdate(`liveEventsBySportHandle_${sportHandle}_${gameTypesStr}`, {
            type: 'liveEventsBySportHandle',
            sportHandle: sportHandle,
            gameTypes: gameTypes,
            data: liveEventsData
        });
        console.log(`📦 Queued live events for batching: ${sportHandle} (gameTypes: ${gameTypesStr})`);
    }
});

appEmitter.on('unsubscribeLiveEventsBySportHandle', (sportHandle: string, gameTypes: number[], clientId: string) => {
    // Unsubscribe from market categories for this sport
    unsubscribeFromLiveEventMarketCategories(sportHandle, clientId);
    
    // Note: We can't easily unsubscribe from specific market category events without knowing the category IDs
    // This would require keeping track of subscribed categories per client
    console.log(`🔄 Unsubscribed from live events market categories for ${sportHandle} (gameTypes: ${gameTypes.join(';')})`);
});

// Keep backward compatibility with old events (but don't broadcast to prevent double broadcasts)
appEmitter.on('getLeagues', async (nodeId: string) => {
    const leagues = await getLeagues(nodeId);
    if (leagues) {
        // Only update structure, let main fetch cycle handle broadcasting
        updateCodereDataStructure('leagues', leagues, nodeId);
    }
});

appEmitter.on('getLeagueEvents', async (leagueNodeId: string) => {
    const events = await getLeagueEvents(leagueNodeId);
    if (events) {
        // Only update structure, let main fetch cycle handle broadcasting
        updateCodereDataStructure('leagueEvents', events, leagueNodeId);
    }
});

// Handler for getting match category data when a match is watched
appEmitter.on('getMatchCategoryData', async (matchId: string, clientId: string, ws?: any) => {
    try {
        const requestUrl = `https://m.codere.com.co/NavigationService/Game/GetGamesLiveByCategoryInfo?parentid=${matchId}&categoryInfoId=99`;
        console.log(`\n=== MATCH CATEGORY REQUEST ===`);
        console.log(`🎯 Fetching category data for watched match ${matchId}`);
        console.log(`👤 Client ID: ${clientId}`);
        console.log(`🔌 WebSocket ready: ${ws && ws.readyState === 1 ? 'YES' : 'NO'}`);
        console.log(`🌐 MANUAL TEST URL: ${requestUrl}`);
        console.log(`===============================\n`);
        
        const categoryData = await getGameLiveByCategoryInfo(matchId);
        
        console.log(`🔍 [DEBUG] Raw category data received:`, {
            hasCategoryData: !!categoryData,
            categoryInfosLength: categoryData?.CategoryInfos?.length || 0,
            hasEvent: !!categoryData?.Event,
            eventGamesLength: categoryData?.Event?.Games?.length || 0
        });
        
        if (categoryData) {
            // Extract categories and games from the response
            const categories = categoryData.CategoryInfos || [];
            const markets = categoryData.Event?.Games?.map((game: any) => ({
                name: game.Name,
                key: game.NodeId,
                outcomes: game.Results?.map((result: any) => ({
                    name: result.Name,
                    price: result.Odd,
                    point: result.GameSpecialOddsValue ? result.GameSpecialOddsValue.replace(/<Spov>|<\/Spov>/g, '') : '',
                    suspended: result.Locked,
                    oddChange: 0,
                })) || [],
            })) || [];
            
            console.log(`📋 RESULT: Found ${categories.length} categories and ${markets.length} markets for match ${matchId}`);
            console.log(`📂 Categories:`, categories.map((c: any) => `${c.CategoryName} (${c.CategoryId})`).join(', '));
            console.log(`🎮 Markets:`, markets.map((m: any) => `${m.name} (${m.key})`).join(', '));
            
            if (ws && ws.readyState === 1) {
                console.log(`✅ [SENDING] WebSocket ready, sending matchCategoryData to client`);
                // Send immediate response with category data
                const responseData = {
                    type: 'matchCategoryData',
                    matchId: matchId,
                    categories: categories,
                    markets: markets,
                    timestamp: Date.now()
                };
                sendImmediateResponse(ws, responseData);
                console.log(`✅ [SENT] matchCategoryData sent successfully`);
            } else {
                console.log(`❌ [ERROR] WebSocket not ready - readyState: ${ws ? ws.readyState : 'null'}`);
                console.log(`❌ [ERROR] Cannot send category data to client`);
            }
        } else {
            console.log(`⚠️ [WARNING] No category data received from API for match ${matchId}`);
            console.log(`🔍 You can test this URL manually: ${requestUrl}`);
            
            // Send empty response to prevent frontend from waiting indefinitely
            if (ws && ws.readyState === 1) {
                sendImmediateResponse(ws, {
                    type: 'matchCategoryData',
                    matchId: matchId,
                    categories: [],
                    markets: [],
                    timestamp: Date.now(),
                    error: 'No data received from API'
                });
            }
        }
    } catch (error) {
        console.error(`❌ Error fetching category data for match ${matchId}:`, error);
        
        // Send error response to prevent frontend from waiting indefinitely
        if (ws && ws.readyState === 1) {
            sendImmediateResponse(ws, {
                type: 'matchCategoryData',
                matchId: matchId,
                categories: [],
                markets: [],
                timestamp: Date.now(),
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
});

// Handler for getting category-specific markets
appEmitter.on('getCategoryMarkets', async (matchId: string, categoryId: string, clientId: string, ws?: any) => {
    try {
        const requestUrl = `https://m.codere.com.co/NavigationService/Game/GetGamesLiveByCategoryInfo?parentid=${matchId}&categoryInfoId=${categoryId}`;
        console.log(`\n=== CATEGORY REQUEST ===`);
        console.log(`🎯 Fetching markets for match ${matchId}, category ${categoryId}`);
        console.log(`🌐 MANUAL TEST URL: ${requestUrl}`);
        console.log(`========================\n`);
        
        const { getCategorySpecificMarkets } = await import('./codere');
        const categoryData = await getCategorySpecificMarkets(matchId, categoryId);
        
        if (categoryData && ws && ws.readyState === 1) {
            console.log(`🔍 [DEBUG] Raw API response for category ${categoryId}:`);
            console.log(`   - Event exists: ${!!categoryData.Event}`);
            console.log(`   - Event.Games exists: ${!!categoryData.Event?.Games}`);
            console.log(`   - Event.Games length: ${categoryData.Event?.Games?.length || 0}`);
            
            // Extract games/markets for the specific category
            const markets = categoryData.Event?.Games?.map((game: any) => ({
                name: game.Name,
                key: game.NodeId,
                CategoryId: categoryId, // Add category ID to each market
                outcomes: game.Results?.map((result: any) => ({
                    name: result.Name,
                    price: result.Odd,
                    point: result.GameSpecialOddsValue ? result.GameSpecialOddsValue.replace(/<Spov>|<\/Spov>/g, '') : '',
                    suspended: result.Locked,
                    oddChange: 0,
                })) || [],
            })) || [];
            
            console.log(`📋 RESULT: Found ${markets.length} markets for category ${categoryId}`);
            
            if (markets.length === 0) {
                console.log(`⚠️ NO MARKETS - API returned empty or no games for this category`);
                console.log(`🔍 You can test this URL manually: ${requestUrl}`);
            }
            
            // Send immediate response with category-specific markets
            sendImmediateResponse(ws, {
                type: 'categoryMarkets',
                matchId: matchId,
                categoryId: categoryId,
                markets: markets,
                timestamp: Date.now()
            });
        } else {
            console.log(`⚠️ No category markets data received or WebSocket not ready for match ${matchId}, category ${categoryId}`);
            console.log(`🔍 You can test this URL manually: ${requestUrl}`);
            
            // Send empty response to prevent loading state
            if (ws && ws.readyState === 1) {
                sendImmediateResponse(ws, {
                    type: 'categoryMarkets',
                    matchId: matchId,
                    categoryId: categoryId,
                    markets: [],
                    timestamp: Date.now(),
                    error: 'No data received'
                });
            }
        }
    } catch (error) {
        const requestUrl = `https://m.codere.com.co/NavigationService/Game/GetGamesLiveByCategoryInfo?parentid=${matchId}&categoryInfoId=${categoryId}`;
        console.error(`❌ Error fetching category markets for match ${matchId}, category ${categoryId}:`, error);
        console.log(`🔍 You can test this URL manually: ${requestUrl}`);
        
        // Send error response to prevent loading state
        if (ws && ws.readyState === 1) {
            sendImmediateResponse(ws, {
                type: 'categoryMarkets',
                matchId: matchId,
                categoryId: categoryId,
                markets: [],
                timestamp: Date.now(),
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
});

export const startDataFetching = async (browser: Browser | null) => {
    const apiNames = (process.env.APIS_TO_FETCH || '').split(',').filter(Boolean);
    if (apiNames.length === 0) {
        console.warn('⚠️ No APIs specified in APIS_TO_FETCH environment variable. No data will be fetched.');
        return;
    }

    console.log(`🔍 Configured to fetch data from: [${apiNames.join(', ')}]`);

    const sources: IDataSource[] = [];
    for (const name of apiNames) {
        try {
            const module = await import(`./${name.trim()}`);
            if (name.trim() === 'sofascore') {
                sources.push(new module.SofaScoreDataSource(browser));
            } else {
                sources.push(module.default);
            }
        } catch (error) {
            console.error(`❌ Failed to load data source module for: ${name}`, error);
        }
    }

    const fetchDataInterval = parseInt(process.env.FETCH_DATA_INTERVAL_MS || '5000', 10);

    const fetchDataLoop = async () => {
        console.log('--- Starting new data fetch cycle ---');

        const promises = sources.map(source => source.fetchData(browser));
        const results = await Promise.allSettled(promises);

        const allSports: CombinedData['sports'] = [];
        const allLiveEvents: CombinedData['liveEvents'] = [];
        const allStandardizedEvents: CombinedData['standardizedEvents'] = [];
        let codereData: CombinedData['codere'] | undefined = undefined;
        let sofascoreData: any | undefined = undefined;

        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                const sourceName = sources[index].name;
                console.log(`👍 Successfully fetched data from ${sourceName}.`);
                
                allSports.push(...(result.value.sports || []));
                allLiveEvents.push(...(result.value.liveEvents || []));
                allStandardizedEvents.push(...(result.value.standardizedEvents || []));

                if (result.value.codere) {
                    codereData = { ...codereData, ...result.value.codere };
                }
                if (result.value.sofascore) {
                    sofascoreData = { ...sofascoreData, ...result.value.sofascore };
                }
            } else if (result.status === 'rejected') {
                const sourceName = sources[index].name;
                console.error(`👎 Failed to fetch data from ${sourceName}:`, result.reason);
            }
        });
        const watchedMatchIds = getWatchedMatches();
        // If there are any matches being watched, fetch their detailed odds.
        if (watchedMatchIds.length > 0) {
            for (const matchId of watchedMatchIds) {
                const extraData = await getGameLiveByCategoryInfo(matchId);
                if (extraData) {
                    const matchIndex = allLiveEvents.findIndex(event => String(event.id) == matchId);
                    if (matchIndex > -1) {
                        const eventDetails = extraData.Event && extraData.Event.Games.length > 0 ? extraData.Event : null;
                        if (eventDetails) {
                            // Transform and assign the detailed odds to the 'markets' property.
                            allLiveEvents[matchIndex].markets = eventDetails.Games.map((game: any) => ({
                                name: game.Name,
                                key: game.NodeId,
                                outcomes: game.Results.map((result: any) => ({
                                    name: result.Name,
                                    price: result.Odd,
                                    point: result.GameSpecialOddsValue ? result.GameSpecialOddsValue.replace(/<Spov>|<\/Spov>/g, '') : '',
                                    suspended: result.Locked,
                                    oddChange: 0, // Not available in Codere API
                                })),
                            }));
                        }
                    }
                }
            }
        }
        
        // Preserve existing cached subscription data to prevent flickering
        const previousCodereData = latestData.codere;
        
        latestData = {
            sports: allSports,
            liveEvents: allLiveEvents,
            standardizedEvents: allStandardizedEvents,
            codere: codereData || previousCodereData,  // Only update if we have new data
            sofascore: sofascoreData
        };
        
        // Always restore cached subscription data, regardless of whether we got new base data
        if (previousCodereData?.leftMenu?.sports) {
            try {
                // Restore cached submenu data (leagues and events) from previous data
                if (latestData.codere?.leftMenu?.sports) {
                    previousCodereData.leftMenu.sports.forEach((existingSport: any) => {
                        if (existingSport.Submenu) {
                            const currentSportIndex = latestData.codere!.leftMenu!.sports.findIndex((s: any) => s.NodeId === existingSport.NodeId);
                            if (currentSportIndex > -1) {
                                // Preserve the cached submenu data (leagues and events)
                                latestData.codere!.leftMenu!.sports[currentSportIndex].Submenu = existingSport.Submenu;
                            }
                        }
                    });
                }
                console.log('✅ Preserved cached subscription data during main fetch cycle');
            } catch (error) {
                console.warn('⚠️ Failed to preserve cached subscription data:', error);
            }
        }

        // Queue main data update for batching instead of immediate broadcast
        const dataToSend = {
            type: 'mainData',
            data: {
                sports: latestData.sports,
                liveEvents: latestData.liveEvents,
                standardizedEvents: latestData.standardizedEvents,
                codere: latestData.codere,
                sofascore: latestData.sofascore
            }
        };
        
        // Debug: Log SofaScore data being sent
        if (latestData.sofascore) {
            console.log(`🔍 [DEBUG] SofaScore data being sent to frontend:`, {
                standardizedEventsCount: latestData.standardizedEvents?.length || 0,
                liveEventsCount: latestData.sofascore.liveEvents?.length || 0,
                sportsCount: latestData.sofascore.sports?.length || 0,
                liveSportsCount: latestData.sofascore.liveSports?.length || 0,
                tournamentsKeys: Object.keys(latestData.sofascore.tournaments || {}),
                playersKeys: Object.keys(latestData.sofascore.players || {})
            });
        } else {
            console.log(`🔍 [DEBUG] No SofaScore data to send to frontend`);
        }
        
        broadcastSubscriptionUpdate('mainData', dataToSend);
        console.log(`📦 Queued main data update for batching`);
    };

    // Initial fetch, then set interval
    fetchDataLoop();
    setInterval(fetchDataLoop, fetchDataInterval);
};

// Event listeners for external API monitoring
appEmitter.on('getApiStats', (clientId: string, ws?: any) => {
    try {
        const stats = getExternalApiStats();
        if (ws && ws.readyState === 1) {
            sendImmediateResponse(ws, {
                type: 'apiStats',
                data: stats,
                timestamp: Date.now()
            });
            console.log(`📊 [API MONITORING] Sent statistics to client ${clientId}`);
        }
    } catch (error) {
        console.error(`❌ Error getting API stats for client ${clientId}:`, error);
    }
});

appEmitter.on('resetApiStats', (clientId: string, ws?: any) => {
    try {
        resetAllApiStats();
        if (ws && ws.readyState === 1) {
            sendImmediateResponse(ws, {
                type: 'apiStatsReset',
                success: true,
                timestamp: Date.now()
            });
            console.log(`🔄 [API MONITORING] Reset statistics for client ${clientId}`);
        }
    } catch (error) {
        console.error(`❌ Error resetting API stats for client ${clientId}:`, error);
    }
});