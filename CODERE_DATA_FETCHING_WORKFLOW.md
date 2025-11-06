# Codere Data Fetching Workflow Documentation

## Overview

This document provides a comprehensive explanation of the current Codere data fetching implementation in the LuckiaServer project. The system implements a sophisticated subscription-based architecture with intelligent caching, real-time data updates, and multiple specialized API endpoints.

## Architecture Components

### 1. Core Components

- **Cache Manager** (`src/common/cacheManager.ts`): Advanced subscription-based caching system
- **Codere Data Source** (`src/sources/codere/index.ts`): Main API integration and data transformation
- **WebSocket Server** (`src/common/websocketServer.ts`): Real-time client communication
- **Event Emitter** (`src/common/events.ts`): Inter-component communication

### 2. Data Flow Architecture

```
Client (Frontend) 
    ↓ WebSocket Connection
WebSocket Server
    ↓ Event Emissions
Codere Data Source
    ↓ Subscription Requests
Cache Manager
    ↓ Automatic Fetching (5s intervals)
Codere API Endpoints
    ↓ Data Transformation
Live Events / Menu Data
    ↓ Real-time Updates
Connected Clients
```

## API Endpoints Integration

### Primary Endpoints

1. **Live Events**: `GetLiveEventsAndSportsBySportHandle`
2. **Left Menu**: Navigation structure and sports categories
3. **Submenu**: Sport-specific navigation options
4. **League Events**: Events within specific leagues
5. **Match Categories**: Betting categories for specific matches
6. **Match Games**: Detailed betting options for match categories

### Endpoint Patterns

```typescript
// Live Events with gameTypes filtering
https://sports.codere.es/NavigationService/GetLiveEventsAndSportsBySportHandle?sportHandle={sport}&gametypes={types}

// Left Menu Structure
https://sports.codere.es/NavigationService/GetMenuLeft

// League Events with 5-second polling
https://sports.codere.es/NavigationService/EventGetEvents?parentId={leagueId}&gametypes={types}
```

## Subscription System

### Cache Manager Subscription Model

The cache manager implements a sophisticated subscription system:

```typescript
interface CacheEntry<T> {
    data: T;                              // Cached data
    lastUpdate: number;                   // Timestamp of last update
    subscribers: Set<string>;             // Client IDs subscribed to this data
    intervalId?: NodeJS.Timeout;          // Auto-refresh interval
    fetcher: () => Promise<T | null>;     // Data fetching function
    cacheDuration: number;                // Custom cache duration (5 seconds default)
    callbacks: Set<(data: T | null) => void>; // Update callbacks
}
```

### Key Features:

1. **Automatic Subscription Management**: Clients subscribe to specific data endpoints
2. **Intelligent Caching**: Data is cached with configurable TTL (5 seconds default)
3. **Automatic Cleanup**: Intervals are stopped when no subscribers remain
4. **Real-time Updates**: Callbacks execute when new data arrives
5. **Client Disconnection Handling**: All subscriptions cleaned up on disconnect

## Data Fetching Workflow

### 1. Client Connection Process

```typescript
// Client connects via WebSocket
Client → WebSocket Server → Assigns unique clientId → Sends immediate data (if available)
```

### 2. Subscription Process

```typescript
// Client requests data subscription
Client.send({ action: 'getLeagueEvents', leagueNodeId: '123' })
    ↓
WebSocket Server receives message
    ↓ 
Emits 'subscribeLeagueEvents' event
    ↓
Codere Data Source handles subscription
    ↓
Cache Manager.subscribe() with:
    - Endpoint key (e.g., 'leagueEvents_123')
    - Client ID
    - Fetcher function
    - Callback for real-time updates
    - Cache duration (5 seconds)
```

### 3. Automatic Data Fetching

```typescript
// When first client subscribes to endpoint
Cache Manager starts interval (5 seconds)
    ↓
Executes fetcher function
    ↓
Calls Codere API (with gameTypes filtering)
    ↓
Transforms API response to internal format
    ↓
Updates cache with new data
    ↓
Executes all registered callbacks
    ↓
Broadcasts updates to subscribed clients via WebSocket
```

### 4. Data Transformation Pipeline

```typescript
// Raw Codere API Response
CodereApiResponse
    ↓ transformNewData()
Internal LiveEvent[] format
    ↓ Additional transformations
Frontend-ready JSON
    ↓ WebSocket broadcast
Connected clients receive updates
```

## Supported Subscription Types

### 1. Live Events Subscription
```typescript
// Real-time live sports events
subscribeToLiveEvents(clientId: string, ws?: WebSocket)
```

### 2. Left Menu Subscription
```typescript
// Navigation menu structure
subscribeToLeftMenu(clientId: string, ws?: WebSocket)
```

### 3. League Subscription
```typescript
// Leagues within a sport category
subscribeToLeagues(nodeId: string, clientId: string, ws?: WebSocket)
```

### 4. League Events Subscription
```typescript
// Events within a specific league
subscribeToLeagueEvents(leagueNodeId: string, clientId: string, ws?: WebSocket)
```

### 5. League Events with Games
```typescript
// Events with detailed betting options (gameTypes filtering)
subscribeToLeagueEventsWithGames(leagueNodeId: string, clientId: string, ws?: WebSocket)
```

### 6. Match Categories Subscription
```typescript
// Betting categories for specific matches
subscribeToMatchCategories(matchId: string, clientId: string, ws?: WebSocket)
```

### 7. Match Games Subscription
```typescript
// Detailed betting games within match categories
subscribeToMatchGames(matchId: string, categoryId: string, clientId: string, ws?: WebSocket)
```

## GameTypes Parameter System

### Purpose
The `gameTypes` parameter filters betting options returned by Codere API endpoints:

```typescript
// Common gameTypes combinations
"1;18"    // Main markets (1x2, Over/Under, etc.)
"1"       // Basic betting markets only
"18"      // Additional betting options
"1;18;25" // Extended market coverage
```

### Implementation
```typescript
const gameTypes = "1;18"; // Configurable in fetcher functions
const url = `${baseUrl}?parentId=${leagueNodeId}&gametypes=${gameTypes}`;
```

## Error Handling and Resilience

### 1. API Failure Handling
- Automatic retry logic in cache manager
- Graceful degradation to cached data
- Error logging and client notification

### 2. Client Disconnection Handling
```typescript
ws.on('close', () => {
    cacheManager.unsubscribeClient(clientId); // Clean up all subscriptions
    clientConnections.delete(ws);             // Remove from connection map
});
```

### 3. Mock Data Fallback
- Extensive mock data system for development
- Automatic fallback when API unavailable
- Consistent data structure regardless of source

## Performance Optimizations

### 1. Batched WebSocket Updates
- Updates queued for 5-second intervals
- Reduces WebSocket message frequency
- Consolidates multiple data changes

### 2. Intelligent Caching
- Per-endpoint cache configuration
- Automatic cache invalidation
- Memory-efficient subscriber tracking

### 3. Selective Data Fetching
- Only active endpoints fetch data
- Automatic cleanup of unused subscriptions
- Client-specific data filtering

## Configuration Options

### Cache Durations
```typescript
const CACHE_DURATIONS = {
    liveEvents: 5000,      // 5 seconds (real-time data)
    leftMenu: 30000,       // 30 seconds (relatively static)
    leagues: 30000,        // 30 seconds (stable structure)
    leagueEvents: 5000,    // 5 seconds (live events)
    matchCategories: 10000, // 10 seconds (moderate frequency)
    matchGames: 5000       // 5 seconds (live betting data)
};
```

### API Configuration
```typescript
const CODERE_CONFIG = {
    baseUrl: 'https://sports.codere.es/NavigationService',
    defaultGameTypes: '1;18',
    timeout: 10000,
    retryAttempts: 3
};
```

## WebSocket Message Protocol

### Client → Server Messages
```typescript
// Subscribe to league events
{
    "action": "getLeagueEvents",
    "leagueNodeId": "123"
}

// Unsubscribe from league events
{
    "action": "unsubscribeLeagueEvents", 
    "leagueNodeId": "123"
}

// Get cache statistics
{
    "action": "getCacheStats"
}
```

### Server → Client Messages
```typescript
// Batched updates (every 5 seconds)
{
    "messageType": "batchedUpdate",
    "timestamp": 1642584000000,
    "updates": [
        {
            "subscriptionKey": "leagueEvents_123",
            "data": { /* transformed events */ }
        }
    ]
}

// Immediate response (new connections)
{
    "messageType": "immediate",
    "sports": [...],
    "liveEvents": [...],
    "timestamp": 1642584000000
}
```

## Data Transformation Details

### Input Format (Codere API)
```typescript
// Raw Codere API structure
interface CodereEvent {
    Events: Array<{
        Id: number;
        Name: string;
        StartTime: string;
        // ... complex nested structure
    }>;
}
```

### Output Format (Internal)
```typescript
// Transformed to standardized LiveEvent format
interface LiveEvent {
    id: number;
    api_name: string;
    sport_category: string;
    sport_title: string;
    home_team: string;
    away_team: string;
    markets: Market[];
    commence_time: string;
    status: string;
    // ... standardized fields
}
```

### Transformation Functions

1. **transformNewData()**: Main transformation logic
2. **transformCodereEventsToLiveEvents()**: Event-specific transformation
3. **extractTeamNames()**: Team name parsing
4. **parseMarkets()**: Betting market extraction
5. **formatDateTime()**: Time standardization

## Monitoring and Debugging

### Cache Statistics
```typescript
// Get real-time cache information
const stats = cacheManager.getStats();
console.log(`Active endpoints: ${stats.activeEndpoints}`);
console.log(`Total subscriptions: ${stats.totalSubscriptions}`);
```

### Logging System
- Comprehensive console logging
- Color-coded log levels (✅ success, ❌ error, 🔄 processing)
- Client identification in logs
- Performance metrics tracking

### Debug Commands
```typescript
// Force cache refresh
cacheManager.forceRefresh('liveEvents');

// Get cached data without subscription
const data = cacheManager.getCachedData('leagueEvents_123');
```

## Migration Notes

### From Legacy System
The current implementation replaced a simpler polling system with:

1. **Subscription-based Architecture**: Eliminates unnecessary API calls
2. **Intelligent Caching**: Reduces server load and improves response times
3. **Real-time Updates**: Provides immediate data updates to clients
4. **Multi-endpoint Support**: Enables granular data fetching
5. **Automatic Cleanup**: Prevents memory leaks and resource waste

### API Endpoint Migration
- **Old**: Simple polling of `GetLiveEvents`
- **New**: Multiple specialized endpoints with `gameTypes` filtering
- **Benefits**: More targeted data fetching, reduced bandwidth, improved performance

## Future Enhancements

### Potential Improvements
1. **Redis Integration**: Distributed caching for horizontal scaling
2. **Circuit Breaker Pattern**: Enhanced API failure handling
3. **Data Compression**: WebSocket message compression for large datasets
4. **Advanced Filtering**: Client-side filtering capabilities
5. **Metrics Dashboard**: Real-time monitoring and analytics

### Scalability Considerations
- Horizontal scaling with shared cache
- Load balancing for WebSocket connections
- Database integration for persistent caching
- API rate limiting and throttling

---

This documentation provides a comprehensive overview of the Codere data fetching workflow, from initial client connection through real-time data delivery. The system's subscription-based architecture ensures efficient resource utilization while providing real-time updates to connected clients.