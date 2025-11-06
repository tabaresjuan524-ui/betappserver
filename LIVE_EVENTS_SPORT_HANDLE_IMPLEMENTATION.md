# Live Events by Sport Handle Implementation

## Overview

Successfully implemented a new API call to `https://m.codere.com.co/NavigationService/Event/GetLiveEventsAndSportsBySportHandle?sportHandle={sport}&gametypes={gameTypes}` with 5-second caching for market tabs functionality in live events.

## ✅ Implementation Details

### 1. **New API Endpoint Added**
- **URL**: `https://m.codere.com.co/NavigationService/Event/GetLiveEventsAndSportsBySportHandle?sportHandle={sport}&gametypes={gameTypes}`
- **Purpose**: Fetch live events filtered by sport handle and specific game types (market categories)
- **Parameters**: 
  - `sportHandle`: Sport identifier (e.g., 'soccer', 'basketball', 'tennis')
  - `gametypes`: Semicolon-separated list of game type IDs (e.g., '1;18' for soccer main markets)

### 2. **Cache Manager Integration**
- **Function**: `subscribeToLiveEventsBySportHandle(sportHandle, gameTypes, clientId, callback)`
- **Cache Duration**: 5 seconds (as requested)
- **Automatic Polling**: Starts when first client subscribes, stops when last client unsubscribes
- **Multi-client Support**: Multiple clients requesting same sport/gameTypes share single API call

### 3. **WebSocket Events**
- **Subscribe**: `getLiveEventsBySportHandle` action with `sportHandle` and `gameTypes` parameters
- **Unsubscribe**: `unsubscribeLiveEventsBySportHandle` action
- **Real-time Updates**: All subscribed clients receive live data every 5 seconds

### 4. **Data Structure**
The API returns a `CodereLiveEventsResponse` interface:
```typescript
interface CodereLiveEventsResponse {
    SportHandleList: string[];  // Available sport handles
    Events: NewCodereEvent[];   // Live events with market data
}
```

### 5. **Market Types by Sport**
Common game type combinations for different sports:
- **Soccer/Football**: `1;18` (Match Result, Over/Under)
- **Basketball**: `97;159` (Spread, Totals)
- **Tennis**: `1;97` (Match Winner, Handicap)
- **Baseball**: `1;18;97` (Moneyline, Totals, Spread)

## 🔧 Usage Examples

### Frontend WebSocket API

```javascript
// Subscribe to soccer live events with main market types
ws.send(JSON.stringify({
    action: 'getLiveEventsBySportHandle',
    sportHandle: 'soccer',
    gameTypes: [1, 18]  // Match Result + Over/Under
}));

// Subscribe to basketball live events  
ws.send(JSON.stringify({
    action: 'getLiveEventsBySportHandle',
    sportHandle: 'basketball',
    gameTypes: [97, 159]  // Spread + Totals
}));

// Unsubscribe
ws.send(JSON.stringify({
    action: 'unsubscribeLiveEventsBySportHandle',
    sportHandle: 'soccer',
    gameTypes: [1, 18]
}));
```

### Backend Event Handling

```typescript
// Automatic subscription with 5-second polling
appEmitter.on('subscribeLiveEventsBySportHandle', (sportHandle, gameTypes, clientId, ws) => {
    const callback = (data) => {
        // Broadcast updates to all subscribed clients
        broadcastSubscriptionUpdate(`liveEventsBySportHandle_${sportHandle}_${gameTypes.join(';')}`, {
            type: 'liveEventsBySportHandle',
            sportHandle: sportHandle,
            gameTypes: gameTypes,
            data: data
        });
    };
    
    const data = subscribeToLiveEventsBySportHandle(sportHandle, gameTypes, clientId, callback);
    // ... handle immediate response
});
```

## 📊 Data Flow

1. **Client Request**: Frontend sends `getLiveEventsBySportHandle` with sport and game types
2. **Cache Check**: System checks if data for this sport/gameTypes combination exists and is fresh
3. **API Call**: If cache miss or expired, makes HTTP request to Codere API
4. **Data Transform**: Transforms API response to standard `CodereLiveEventsResponse` format
5. **Cache Store**: Stores data with 5-second TTL and starts polling interval
6. **Broadcast**: Sends data to all subscribed clients via WebSocket
7. **Auto Polling**: Repeats API call every 5 seconds while clients are subscribed
8. **Cleanup**: Stops polling when last client unsubscribes

## 🧪 Testing

### Test Client Features
- **Live Connection**: Real-time WebSocket connection to `ws://localhost:8081`
- **Sport Selection**: Dropdown for different sports (soccer, basketball, tennis, etc.)
- **Game Types**: Configurable market categories for each sport
- **Quick Tests**: Pre-configured buttons for common sport/market combinations
- **Live Monitoring**: Real-time display of received events and market data
- **Cache Statistics**: View active subscriptions and polling intervals

### Test URLs
- **Test Client**: `http://localhost:3001/test-live-events-sport-handle.html`
- **WebSocket Server**: `ws://localhost:8081`

## 🎯 Benefits for Market Tabs

1. **Efficient Market Loading**: Only loads specific market types needed for current view
2. **Real-time Updates**: Market odds update every 5 seconds automatically
3. **Bandwidth Optimization**: Filters events by sport to reduce data transfer
4. **Multiple Market Types**: Supports multiple game types per sport (e.g., 1X2, Over/Under, Handicap)
5. **Scalable**: Multiple clients can request same sport/markets with single API call

## 🔄 Integration with Existing System

The new functionality integrates seamlessly with the existing cache management system:
- Uses same 5-second batching mechanism for WebSocket updates
- Follows same subscription/unsubscription patterns as other endpoints
- Maintains backward compatibility with existing API calls
- Leverages existing error handling and logging infrastructure

## 📝 Configuration

### Environment Variables
- `USE_MOCK_DATA=true`: Uses mock data for testing (uses existing mock file)
- `FETCH_DATA_INTERVAL_MS`: Controls main data fetch cycle (default: 5000ms)

### Mock Data
Uses existing mock file: `0NavigationService_Event_GetLiveEventsAndSportsBySportHandle_gametypes.json`

This implementation provides a robust, scalable solution for fetching live events with specific market tabs, updating every 5 seconds as requested, with proper client coordination and automatic cleanup.