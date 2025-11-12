import { WebSocketServer, WebSocket } from 'ws';
import { CombinedData } from './commonTypes';
import { appEmitter } from './events';
import { cacheManager } from './cacheManager';

let wss: WebSocketServer;
let clientIdCounter = 0;
const watchedMatches = new Map<string, number>();
const clientConnections = new Map<WebSocket, string>(); // ws -> clientId

// Batching mechanism for consolidated WebSocket updates
interface BatchedUpdate {
    timestamp: number;
    data: CombinedData;
    subscriptionUpdates: Record<string, any>;
}

let batchedData: BatchedUpdate | null = null;
let batchTimeout: NodeJS.Timeout | null = null;
const BATCH_INTERVAL_MS = 5000; // 5 seconds

// Queue for batching updates
const queuedUpdates = new Map<string, any>();

// Function to queue an update for batching
const queueUpdate = (updateType: string, data: any) => {
    queuedUpdates.set(updateType, data);
    
    // If we don't have a pending batch, start the timer
    if (!batchTimeout) {
        batchTimeout = setTimeout(() => {
            sendBatchedUpdate();
        }, BATCH_INTERVAL_MS);
    }
};

// Function to send batched updates
const sendBatchedUpdate = () => {
    if (queuedUpdates.size === 0) {
        batchTimeout = null;
        return;
    }

    // Separate mainData from other subscription updates
    const mainDataUpdate = queuedUpdates.get('mainData');
    queuedUpdates.delete('mainData');

    // The rest are subscription-specific updates
    const subscriptionUpdates = Array.from(queuedUpdates.entries()).map(([subscriptionKey, data]) => ({
        subscriptionKey,
        ...data 
    }));

    // 🔍 DEBUG: Log subscription updates structure
    if (subscriptionUpdates.length > 0) {
        console.log(`\n🔍 [SUBSCRIPTION DEBUG] Processing ${subscriptionUpdates.length} subscription updates:`);
        subscriptionUpdates.forEach((update, index) => {
            console.log(`   Update ${index + 1}:`, {
                subscriptionKey: update.subscriptionKey,
                type: update.type,
                hasNodeId: !!update.nodeId,
                hasLeagueNodeId: !!update.leagueNodeId,
                hasData: !!update.data,
                dataKeys: update.data ? Object.keys(update.data).slice(0, 5) : []
            });
        });
    }

    // Consolidate all queued updates
    const consolidatedData: any = {
        timestamp: Date.now(),
        messageType: 'batchedUpdate',
        // If mainData exists, add its properties to the top level
        ...(mainDataUpdate ? mainDataUpdate.data : {}),
        // All other updates go into the 'updates' array
        updates: subscriptionUpdates
    };

    // Ensure standardizedEvents are at the top level if they exist
    if (mainDataUpdate?.data?.standardizedEvents) {
        consolidatedData.standardizedEvents = mainDataUpdate.data.standardizedEvents;
    }

    // 🔍 DEBUG: Log what we're about to send
    console.log(`\n🔍 [WS DEBUG] Preparing to send batched update:`);
    console.log(`   - Has mainData: ${!!mainDataUpdate}`);
    console.log(`   - standardizedEvents count: ${consolidatedData.standardizedEvents?.length || 0}`);
    console.log(`   - liveEvents count: ${consolidatedData.liveEvents?.length || 0}`);
    console.log(`   - sports count: ${consolidatedData.sports?.length || 0}`);
    console.log(`   - codere data exists: ${!!consolidatedData.codere}`);
    console.log(`   - sofascore data exists: ${!!consolidatedData.sofascore}`);
    if (consolidatedData.sofascore) {
        const eventIds = Object.keys(consolidatedData.sofascore.events || {});
        console.log(`   - sofascore.events: ${eventIds.length} events`);
        if (eventIds.length > 0) {
            console.log(`   - First 5 event IDs: ${eventIds.slice(0, 5).join(', ')}`);
            // Show details of first event
            const firstEventId = eventIds[0];
            const firstEvent = consolidatedData.sofascore.events[firstEventId];
            console.log(`   - Sample event ${firstEventId}:`, JSON.stringify(firstEvent, null, 2).substring(0, 300));
        }
        console.log(`   - sofascore.sports: ${Object.keys(consolidatedData.sofascore.sports || {}).length} sports`);
        console.log(`   - sofascore.tournaments: ${Object.keys(consolidatedData.sofascore.tournaments || {}).length} tournaments`);
        console.log(`   - sofascore.teams: ${Object.keys(consolidatedData.sofascore.teams || {}).length} teams`);
    }
    console.log(`   - subscription updates: ${subscriptionUpdates.length}`);

    // Clear the queue
    queuedUpdates.clear();
    batchTimeout = null;

    // Send to all connected clients
    if (wss && wss.clients.size > 0) {
        const dataToSend = JSON.stringify(consolidatedData);
        let successfulSends = 0;
        
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(dataToSend);
                    successfulSends++;
                } catch (error) {
                    const clientId = clientConnections.get(client) || 'unknown';
                    console.error(`❌ Failed to send batched data to ${clientId}:`, error);
                    // Clean up failed connection
                    clientConnections.delete(client);
                    cacheManager.unsubscribeClient(clientId);
                }
            }
        });

        console.log(`📦 Sent batched update to ${successfulSends}/${wss.clients.size} client(s)`);
        if (mainDataUpdate) console.log(`   - Included main data update.`);
        if (subscriptionUpdates.length > 0) console.log(`   - Included ${subscriptionUpdates.length} subscription-specific updates.`);
    }
};

export const initializeWebSocketServer = (port: number) => {
    wss = new WebSocketServer({ 
        port,
        host: '0.0.0.0', // Bind to all interfaces to allow external connections
        perMessageDeflate: false,
        maxPayload: 100 * 1024 * 1024,
        clientTracking: true,
    });

    wss.on('connection', (ws, request) => {
        const clientId = `client_${++clientIdCounter}`;
        clientConnections.set(ws, clientId);
        setTimeout(() => {
            const { getLatestData } = require('../sources');
            const latestData = getLatestData();
            
            if (latestData && (latestData.sports?.length > 0 || latestData.liveEvents?.length > 0)) {
                try {
                    const immediateData = {
                        messageType: 'immediate',
                        ...latestData,
                        timestamp: Date.now()
                    };
                    
                    ws.send(JSON.stringify(immediateData));
                    console.log(`⚡ Sent immediate data to new client ${clientId}: ${latestData.sports?.length || 0} sports, ${latestData.liveEvents?.length || 0} events`);
                } catch (error) {
                    console.error(`❌ Failed to send immediate data to ${clientId}:`, error);
                }
            }
        }, 100); // Small delay to ensure connection is fully established

        ws.on('message', async message => {
            try {
                const data = JSON.parse(message.toString());
                console.log(`📨 Message from ${clientId}:`, data.action);
                
                if (data.action === 'watchMatch' && data.matchId) {
                    const count = watchedMatches.get(data.matchId) || 0;
                    watchedMatches.set(data.matchId, count + 1);
                    
                    // Always fetch category data when a match is watched (not just for first client)
                    console.log(`📺 Client watching match ${data.matchId} (total watchers: ${count + 1}), fetching category data`);
                    appEmitter.emit('getMatchCategoryData', data.matchId, clientId, ws);
                } else if (data.action === 'unwatchMatch' && data.matchId) {
                    const count = watchedMatches.get(data.matchId);
                    if (count && count > 1) {
                        watchedMatches.set(data.matchId, count - 1);
                    } else if (count) {
                        watchedMatches.delete(data.matchId);
                    }
                } else if (data.action === 'getLeagues' && data.nodeId) {
                    // Subscribe to leagues data with automatic caching
                    console.log(`🏀 getLeagues request for nodeId: ${data.nodeId} from ${clientId}`);
                    try {
                        appEmitter.emit('subscribeLeagues', data.nodeId, clientId);
                        console.log(`✅ subscribeLeagues event emitted successfully for ${data.nodeId}`);
                    } catch (emitError) {
                        console.error(`❌ Error emitting subscribeLeagues event for ${data.nodeId}:`, emitError);
                    }
                } else if (data.action === 'getLeagueEvents' && data.leagueNodeId) {
                    // Subscribe to league events data with automatic caching
                    appEmitter.emit('subscribeLeagueEvents', data.leagueNodeId, clientId, ws);
                } else if (data.action === 'unsubscribeLeagues' && data.nodeId) {
                    appEmitter.emit('unsubscribeLeagues', data.nodeId, clientId);
                } else if (data.action === 'unsubscribeLeagueEvents' && data.leagueNodeId) {
                    appEmitter.emit('unsubscribeLeagueEvents', data.leagueNodeId, clientId);
                } else if (data.action === 'getLeagueCategories' && data.leagueNodeId) {
                    // Subscribe to league categories data with automatic caching
                    appEmitter.emit('subscribeLeagueCategories', data.leagueNodeId, clientId, ws);
                } else if (data.action === 'unsubscribeLeagueCategories' && data.leagueNodeId) {
                    appEmitter.emit('unsubscribeLeagueCategories', data.leagueNodeId, clientId);
                } else if (data.action === 'getLeagueEventsWithGames' && data.leagueNodeId) {
                    // Subscribe to league events with games data (with gameTypes parameter and 5-second polling)
                    appEmitter.emit('subscribeLeagueEventsWithGames', data.leagueNodeId, clientId, ws);
                } else if (data.action === 'unsubscribeLeagueEventsWithGames' && data.leagueNodeId) {
                    appEmitter.emit('unsubscribeLeagueEventsWithGames', data.leagueNodeId, clientId);
                } else if (data.action === 'getMatchCategories' && data.matchId) {
                    // Subscribe to match categories data with automatic caching
                    appEmitter.emit('subscribeMatchCategories', data.matchId, clientId, ws);
                } else if (data.action === 'unsubscribeMatchCategories' && data.matchId) {
                    appEmitter.emit('unsubscribeMatchCategories', data.matchId, clientId);
                } else if (data.action === 'getMatchGames' && data.matchId && data.categoryId) {
                    // Subscribe to match games data with automatic caching
                    appEmitter.emit('subscribeMatchGames', data.matchId, data.categoryId, clientId, ws);
                } else if (data.action === 'unsubscribeMatchGames' && data.matchId && data.categoryId) {
                    appEmitter.emit('unsubscribeMatchGames', data.matchId, data.categoryId, clientId);
                } else if (data.action === 'getCategoryMarkets' && data.matchId && data.categoryId) {
                    // Request category-specific markets for a match
                    console.log(`🎯 Requesting category markets for match ${data.matchId}, category ${data.categoryId}`);
                    appEmitter.emit('getCategoryMarkets', data.matchId, data.categoryId, clientId, ws);
                } else if (data.action === 'getCacheStats') {
                    // Send cache statistics to client
                    const stats = cacheManager.getStats();
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'cacheStats', data: stats }));
                    }
                } else if (data.action === 'getSportMarketTypes') {
                    // Subscribe to sport market types data with automatic caching
                    appEmitter.emit('subscribeSportMarketTypes', clientId, ws);
                } else if (data.action === 'unsubscribeSportMarketTypes') {
                    appEmitter.emit('unsubscribeSportMarketTypes', clientId);
                } else if (data.action === 'getLiveEventMarketCategories' && data.sportHandle) {
                    // Subscribe to live event market categories for a specific sport
                    appEmitter.emit('subscribeLiveEventMarketCategories', data.sportHandle, clientId, ws);
                } else if (data.action === 'unsubscribeLiveEventMarketCategories' && data.sportHandle) {
                    appEmitter.emit('unsubscribeLiveEventMarketCategories', data.sportHandle, clientId);
                } else if (data.action === 'getLiveEventsWithMarketCategory' && data.sportHandle && data.marketCategoryId) {
                    // Subscribe to live events filtered by market category
                    appEmitter.emit('subscribeLiveEventsWithMarketCategory', data.sportHandle, data.marketCategoryId, clientId, ws);
                } else if (data.action === 'unsubscribeLiveEventsWithMarketCategory' && data.sportHandle && data.marketCategoryId) {
                    appEmitter.emit('unsubscribeLiveEventsWithMarketCategory', data.sportHandle, data.marketCategoryId, clientId);
                }
            } catch (error) {
                console.error(`❌ Failed to parse message from ${clientId}:`, error);
                // Send error response back to client
                if (ws.readyState === WebSocket.OPEN) {
                    try {
                        ws.send(JSON.stringify({ 
                            type: 'error', 
                            message: 'Invalid message format' 
                        }));
                    } catch (sendError) {
                        console.error(`❌ Failed to send error response to ${clientId}:`, sendError);
                    }
                }
            }
        });

        ws.on('close', (code, reason) => {
            // Clean up all subscriptions for this client
            cacheManager.unsubscribeClient(clientId);
            clientConnections.delete(ws);
        });

        ws.on('pong', () => {
            // Keep connection alive
        });

        ws.on('error', (error) => {
            console.error(`❌ WebSocket error for ${clientId}:`, error);
            // Clean up on error
            cacheManager.unsubscribeClient(clientId);
            clientConnections.delete(ws);
        });
    });
};

// Updated broadcast function to use batching
export const broadcastToAllClients = (data: CombinedData) => {
    if (!wss || wss.clients.size === 0) {
        return;
    }

    // Queue this update for batching instead of sending immediately
    queueUpdate('mainData', data);
};

// Function to broadcast subscription-specific updates with batching
export const broadcastSubscriptionUpdate = (updateType: string, data: any) => {
    if (!wss || wss.clients.size === 0) {
        return;
    }

    // Queue this subscription update for batching
    queueUpdate(updateType, data);
};

// Function to send immediate response for critical updates (like initial subscription responses)
export const sendImmediateResponse = (ws: WebSocket, data: any) => {
    if (ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(data));
        } catch (error) {
            const clientId = clientConnections.get(ws) || 'unknown';
            console.error(`❌ Failed to send immediate response to ${clientId}:`, error);
        }
    }
};

export const getWatchedMatches = (): string[] => {
    return Array.from(watchedMatches.keys());
};