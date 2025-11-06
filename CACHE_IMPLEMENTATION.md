# Cache Manager Implementation

## Overview

The new cache manager implementation solves the issues with the original 5-second cache system by providing:

1. **Client reference counting**: Only makes API calls when there are active subscribers
2. **Automatic cleanup**: Stops API calls when no clients are subscribed
3. **Coordinated updates**: Multiple clients requesting the same data share a single API call
4. **Configurable cache durations**: Different data types can have different cache intervals

## How it works

### Architecture

```
Client 1 ──┐
           ├── WebSocket Server ──> Cache Manager ──> API Endpoints
Client 2 ──┘                            │
                                         ├── 5s interval for league events
                                         ├── 5s interval for submenu
                                         └── 10min interval for left menu
```

### Key Components

1. **CacheManager** (`src/common/cacheManager.ts`)
   - Manages subscriptions and automatic fetching
   - Tracks client subscriptions per endpoint
   - Configurable cache durations per endpoint type

2. **WebSocket Events** (updated in `src/common/websocketServer.ts`)
   - `subscribeLeagues` / `unsubscribeLeagues`
   - `subscribeLeagueEvents` / `unsubscribeLeagueEvents`
   - `getCacheStats` for debugging

3. **Codere Functions** (updated in `src/sources/codere/index.ts`)
   - `subscribeToLeagues()` - with callbacks for real-time updates
   - `subscribeToLeagueEvents()` - with callbacks for real-time updates
   - `subscribeToLeftMenu()` - with 10-minute cache duration

### Cache Durations

- **League Events**: 5 seconds (configurable via DEFAULT_CACHE_DURATION)
- **Submenu (Leagues)**: 5 seconds (configurable via DEFAULT_CACHE_DURATION)  
- **Left Menu**: 10 minutes (600,000ms)

### Benefits

1. **Efficient API Usage**: 
   - 100 clients navigating the same league → only 1 API call every 5 seconds
   - When all clients leave → API calls stop automatically

2. **Real-time Updates**: 
   - All subscribed clients receive updates when cache refreshes
   - Automatic broadcasting via WebSocket

3. **Memory Efficient**: 
   - Automatic cleanup when no subscribers
   - Reference counting prevents memory leaks

## Usage Examples

### Frontend Client Code

```javascript
// Subscribe to league events
ws.send(JSON.stringify({
    action: 'subscribeLeagueEvents',
    leagueNodeId: '12345'
}));

// Unsubscribe when no longer needed
ws.send(JSON.stringify({
    action: 'unsubscribeLeagueEvents', 
    leagueNodeId: '12345'
}));

// Get cache statistics for debugging
ws.send(JSON.stringify({
    action: 'getCacheStats'
}));
```

### Backend Event Handling

```typescript
// Automatic subscription with callback
appEmitter.on('subscribeLeagueEvents', (leagueNodeId: string, clientId: string) => {
    const callback = (data: any) => updateAndBroadcastCodereData('leagueEvents', data, leagueNodeId);
    const events = subscribeToLeagueEvents(leagueNodeId, clientId, callback);
    if (events) {
        updateAndBroadcastCodereData('leagueEvents', events, leagueNodeId);
    }
});
```

## Monitoring & Debugging

Send `getCacheStats` action to get:
- Number of active endpoints
- Total subscriptions  
- Per-endpoint details (subscribers, active intervals, last update time)

## Migration Notes

- Old functions (`getLeagues`, `getLeagueEvents`) are kept for backward compatibility
- New subscription-based functions provide better performance
- WebSocket events updated to support subscribe/unsubscribe patterns
- Automatic client cleanup on disconnect
