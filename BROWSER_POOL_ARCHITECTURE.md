# Multi-Browser Architecture for Scalable Live Event Monitoring

## Problem
- 100+ live sports events need continuous monitoring
- Each event requires an open browser tab to capture live API updates
- Opening 100+ tabs in a single browser causes:
  - **Memory explosion**: 10GB+ RAM usage
  - **Navigation timeouts**: System overwhelmed
  - **Performance degradation**: CPU saturation

## Solution: Browser Pool Architecture

### Architecture Overview
```
┌─────────────────────────────────────────────────────────┐
│         SofaScoreAPIFetcher (Main Controller)           │
│  - Fetches event counts and live events list           │
│  - Coordinates browser pool operations                  │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│           BrowserPoolManager (Load Balancer)            │
│  - Manages 5 browser instances                         │
│  - Distributes events across browsers                   │
│  - Tracks capacity: 5 browsers × 20 tabs = 100 events  │
└──────────────────┬──────────────────────────────────────┘
                   │
      ┌────────────┼────────────┬────────────┬────────────┐
      ▼            ▼            ▼            ▼            ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│Browser 1 │ │Browser 2 │ │Browser 3 │ │Browser 4 │ │Browser 5 │
│ 20 tabs  │ │ 20 tabs  │ │ 20 tabs  │ │ 20 tabs  │ │ 20 tabs  │
└────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
     │            │            │            │            │
     └────────────┴────────────┴────────────┴────────────┘
                              │
                    Continuous API Updates
                    (stored in eventDataCache)
                              │
                              ▼
                    ┌────────────────────┐
                    │  WebSocket Server  │
                    │  (sends to clients │
                    │   every 5 seconds) │
                    └────────────────────┘
```

### Key Features

#### 1. Multiple Browser Instances
- **5 independent browser processes**
- Each browser isolated with own memory space
- **~2GB per browser** = 10GB total for 100 events
- Much more efficient than 100 tabs in 1 browser

#### 2. Load Balancing
- Events distributed evenly across browsers
- Tracks tab count per browser
- Always assigns to least-loaded browser
- Example distribution: `B1:20 | B2:20 | B3:20 | B4:20 | B5:20`

#### 3. Continuous Live Data Capture
- **Tabs stay open indefinitely**
- Response listeners capture ALL API calls
- Updates stored in `eventDataCache` Map
- **Real-time updates** as APIs fire (every 2-5 seconds)

#### 4. Memory Management
- Maximum capacity: 100 events (configurable)
- Browser pool handles memory limits gracefully
- Can close individual event tabs when events end
- Total memory: ~10-12GB for full capacity

### How It Works

#### Initial Setup (Once)
1. Create 5 browser instances in parallel
2. Each browser configured with memory-efficient flags
3. Browser pool ready to accept events

#### Per Event (100 times)
1. Check if event already being monitored (avoid duplicates)
2. Find browser with least tabs
3. Open new tab in that browser
4. Set up response listener for continuous capture
5. Navigate to event page
6. **Tab stays open** - listener captures all subsequent API calls

#### Live Data Flow
```
Event Page → API Calls (every 2-5s) → Response Listener → 
eventDataCache → WebSocket → Clients (every 5s)
```

### Configuration

```typescript
// BrowserPoolManager.ts
private readonly BROWSERS_COUNT = 5;        // Number of browser instances
private readonly TABS_PER_BROWSER = 20;     // Max tabs per browser  
private readonly MAX_TOTAL_EVENTS = 100;    // Total capacity
```

**Adjust based on your system:**
- **8GB RAM**: 3 browsers × 15 tabs = 45 events
- **16GB RAM**: 4 browsers × 20 tabs = 80 events
- **24GB RAM**: 5 browsers × 20 tabs = 100 events
- **32GB RAM**: 6 browsers × 25 tabs = 150 events

### Memory Footprint

| Component | Memory Usage |
|-----------|--------------|
| Node.js Process | ~500MB |
| Browser 1 (20 tabs) | ~2GB |
| Browser 2 (20 tabs) | ~2GB |
| Browser 3 (20 tabs) | ~2GB |
| Browser 4 (20 tabs) | ~2GB |
| Browser 5 (20 tabs) | ~2GB |
| **Total** | **~10.5GB** |

### API Endpoints Captured Per Event

Each event page fires these endpoints continuously:
- `event/{id}` - Event details (score, status)
- `event/{id}/incidents` - Goals, cards, substitutions
- `event/{id}/statistics` - Match stats (possession, shots)
- `event/{id}/lineups` - Team lineups
- `event/{id}/odds/1/featured` - Live betting odds
- `event/{id}/h2h` - Head-to-head history
- `event/{id}/graph` - Score timeline
- And 20+ more endpoints...

### Benefits Over Previous Approach

| Aspect | Old (Single Browser) | New (Browser Pool) |
|--------|---------------------|-------------------|
| Max Events | 10-15 (limited) | 100+ (scalable) |
| Memory | 10GB+ (unstable) | 10GB (controlled) |
| Timeouts | Frequent | Rare |
| Live Updates | Incomplete | Complete |
| Stability | Poor | Excellent |

### Usage

```typescript
// Initialize (once at startup)
const fetcher = new SofaScoreAPIFetcher();
await fetcher.fetchAllData(); // Opens tabs for all live events

// Get live data (every 5 seconds)
const liveData = fetcher.getLiveData(); // Returns cached real-time data
sendToClients(liveData); // Send via WebSocket

// Close specific event when finished
await fetcher.closeEvent('15022378');

// Cleanup (on shutdown)
await fetcher.cleanup();
```

### Monitoring

```
📊 [BROWSER POOL] Distribution: B1:20 | B2:20 | B3:18 | B4:20 | B5:19 (Total: 97)
📊 [MEMORY] RSS: 10847MB | Heap: 892/1024MB | External: 45MB
📊 [CAPACITY] 97/100 tabs across 5 browsers
```

### Future Enhancements

1. **Auto-closing**: Close tabs when event status = "ended"
2. **Dynamic scaling**: Add/remove browsers based on load
3. **Cluster mode**: Distribute across multiple servers
4. **Fallback**: Switch to WebSocket if browser fails
5. **Priority queue**: Monitor important leagues first

### Alternative Considered: Node.js Cluster

```
Master Process
  ├─ Worker 1 (Browser 1) - 20 events
  ├─ Worker 2 (Browser 2) - 20 events
  ├─ Worker 3 (Browser 3) - 20 events
  ├─ Worker 4 (Browser 4) - 20 events
  └─ Worker 5 (Browser 5) - 20 events
```

**Not implemented yet** because:
- Browser pool simpler for now
- Can scale to 100 events easily
- Cluster adds complexity
- Can add later if needed

### Conclusion

This architecture allows monitoring **100+ live events simultaneously** with:
- ✅ Stable memory usage (~10GB)
- ✅ No navigation timeouts
- ✅ Complete real-time data capture
- ✅ Scalable to 150+ events with more RAM
- ✅ Production-ready performance
