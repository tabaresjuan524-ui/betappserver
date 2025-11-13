# Stale Cache Data Fix - November 13, 2025

## Problem Identified

**Issue:** Frontend widgets showing "No data available" for Statistics and H2H tabs despite server claiming to have data.

### Root Cause Analysis

The server was sending **stale cached data** from old browser sessions mixed with fresh data:

1. **Server starts** at 13:41:19
2. **Browser pool opens** only 2-3 NEW events (15016650, 15042180, 15039394)
3. **Server loads old cache file** `sofascore-data-2025-11-13T13-06-24-107Z.json` (created at 13:06:22)
4. **Old cached data includes event 15039405** with incomplete endpoints from 35 minutes ago
5. **Server sends this old data to frontend** every 5 seconds
6. **Frontend displays event 15039405** but without statistics/H2H endpoints (they weren't captured in that old session)

### Evidence from Logs

```
[13:41:21.808Z] 📁 [SOFASCORE] Loaded cached data from file: sofascore-data-2025-11-13T13-06-24-107Z.json
[13:41:21.808Z] 📬 [SOFASCORE] Returning cached data: {
  "sportsWithLiveEvents": 1,
  "totalEvents": 5,
  "lastUpdate": "2025-11-13T13:06:22.936Z"  <-- OLD DATA
}
```

**Server only processed 3 events in current session:**
- Event 15016650 ✅ Fresh data with all endpoints
- Event 15042180 ✅ Fresh data with all endpoints  
- Event 15039394 ✅ Fresh data (partial, server shut down)

**But frontend received 5 events:**
- Event 15016650 ✅ Fresh
- Event 15042180 ✅ Fresh
- Event 15039405 ❌ **STALE** (from 35 minutes ago, missing statistics/H2H)
- Event 15042661 ❌ **STALE** (from old session)
- Event 15042727 ❌ **STALE** (from old session)

### Frontend Symptoms

```javascript
// Frontend console logs:
📊 Available endpoints: (13) ['country/alpha2', 'event/15039405/incidents', ...]
🔑 detailedData keys: (13) ['country/alpha2', 'event/15039405/incidents', ...]
Statistics data check: {
  statisticsKey: 'event/15039405/statistics',
  found: false,  ❌ MISSING
  data: null
}
🔍 H2H Debug: {
  h2hBasicExists: false,  ❌ MISSING
  h2hEventsExists: false,
  eventsCount: 0
}
```

## Solution Implemented

**File:** `luckiaServer/src/sources/sofascore/index.ts`

**Fix:** Added cache freshness validation to filter out stale events before sending to frontend.

### Implementation

```typescript
// CRITICAL FIX: Filter out stale cached events that aren't currently monitored
// Only return events that have fresh data from the current browser session
const filteredData = { ...dataToReturn };
let removedEvents = 0;

if (filteredData.sports) {
    for (const [sportName, sportData] of Object.entries(filteredData.sports)) {
        if ((sportData as any).events) {
            const freshEvents: any = {};
            
            for (const [eventId, eventData] of Object.entries((sportData as any).events)) {
                // Check if this event has fresh data from current session
                const eventFilePath = path.join(__dirname, '../../../sofascore/events', sportName, `${eventId}.json`);
                
                try {
                    if (fs.existsSync(eventFilePath)) {
                        const stats = fs.statSync(eventFilePath);
                        const fileAge = Date.now() - stats.mtimeMs;
                        
                        // Only include events with data modified in the last 5 minutes
                        if (fileAge < 300000) { // 5 minutes = 300,000ms
                            freshEvents[eventId] = eventData;
                        } else {
                            removedEvents++;
                            console.log(`🗑️  [SOFASCORE] Removed stale event ${eventId} (age: ${Math.floor(fileAge / 60000)} min)`);
                        }
                    } else {
                        // No file means no fresh data
                        removedEvents++;
                        console.log(`🗑️  [SOFASCORE] Removed event ${eventId} (no data file)`);
                    }
                } catch (error) {
                    // On error, keep the event to be safe
                    freshEvents[eventId] = eventData;
                }
            }
            
            (filteredData.sports as any)[sportName].events = freshEvents;
        }
    }
}

if (removedEvents > 0) {
    console.log(`🧹 [SOFASCORE] Cleaned up ${removedEvents} stale events from cache`);
}
```

### How It Works

1. **Load cached data** from file (existing behavior)
2. **For each event in cache:**
   - Check if `sofascore/events/{sport}/{eventId}.json` exists
   - Check file modification time
   - If file age > 5 minutes → **Remove from cache**
   - If file doesn't exist → **Remove from cache**
3. **Return filtered data** with only fresh events to frontend

### Expected Behavior After Fix

#### Server Logs (After Restart):
```
📁 [SOFASCORE] Loaded cached data from file: sofascore-data-2025-11-13T13-06-24-107Z.json
🗑️  [SOFASCORE] Removed stale event 15039405 (age: 35 min)
🗑️  [SOFASCORE] Removed event 15042661 (no data file)
🗑️  [SOFASCORE] Removed event 15042727 (no data file)
🧹 [SOFASCORE] Cleaned up 3 stale events from cache
📬 [SOFASCORE] Returning cached data: {
  "sportsWithLiveEvents": 1,
  "totalEvents": 2,  <-- Only fresh events
  "lastUpdate": "2025-11-13T13:41:19.306Z"
}
```

#### Frontend Behavior:
- **Before Fix:** Shows 5 events, 3 with missing data → widgets show "No data available"
- **After Fix:** Shows 2 events, all with complete data → widgets display correctly

## Testing Steps

1. **Restart the server**
2. **Watch server logs** for cache cleanup messages:
   ```
   🗑️  [SOFASCORE] Removed stale event...
   🧹 [SOFASCORE] Cleaned up X stale events from cache
   ```

3. **Check frontend** - should only show events with complete data

4. **Wait for new browser sessions** to fetch more events

5. **Verify widgets** - Statistics and H2H tabs should work for all displayed events

## Configuration

### Cache Freshness Threshold
**Location:** `luckiaServer/src/sources/sofascore/index.ts` (line ~204)

```typescript
if (fileAge < 300000) { // 5 minutes = 300,000ms
```

**Adjust this value** if needed:
- `60000` = 1 minute (very strict)
- `300000` = 5 minutes (recommended)
- `600000` = 10 minutes (more lenient)

## Benefits

✅ **Frontend always receives fresh data** with all endpoints  
✅ **No more "No data available" errors** from stale cache  
✅ **Automatic cache cleanup** on every data fetch  
✅ **Gradual event population** as browser fetches new data  
✅ **Server logs show which events are removed** for debugging  

## Related Files

- **Fixed File:** `luckiaServer/src/sources/sofascore/index.ts`
- **Browser Fetch Logic:** `luckiaServer/src/sources/sofascore/BrowserPoolManager.ts`
- **Event Data Storage:** `luckiaServer/sofascore/events/{sport}/{eventId}.json`
- **Cache File:** `luckiaServer/sofascore/sofascore-data-*.json`

## Impact

- **No breaking changes** - only filters out stale data
- **Performance:** Minimal (file stat checks are fast)
- **Memory:** Reduced (fewer events cached)
- **User Experience:** Improved (no incomplete data)
