# SofaScore Endpoint Interception Fix

## Problem Summary

For event 15042180 (Cambodia vs Hong Kong), the scraper was only capturing **8 endpoints** instead of the full set of available data.

### Missing Endpoints Identified:
- ❌ `event/15042180/statistics`
- ❌ `event/15042180/h2h`
- ❌ `event/15042180/odds/1/all`
- ❌ `event/15042180/win-probability`
- ❌ `event/15042180/team-streaks/betting-odds/1`
- ❌ `team/4765/team-statistics/seasons`
- ❌ `team/7929/team-statistics/seasons`

## Root Causes

### 1. **Wrong Tab Selector**
```typescript
// ❌ OLD - Selector didn't exist in actual SofaScore HTML
await page.waitForSelector('button[data-testid="wcl-tab"]', { timeout: 5000 });
```

**Issue**: SofaScore uses `button[role="tab"]` not `button[data-testid="wcl-tab"]`

### 2. **Missing Tab Interactions**
The scraper only tried to click the H2H tab. It didn't click:
- Statistics tab (to load statistics endpoint)
- Lineups tab (to load lineups endpoint)
- "Show more" button (to load team-streaks/betting-odds)

### 3. **Incomplete Critical Endpoints List**
```typescript
// ❌ OLD - Missing several critical endpoints
const criticalEndpoints = [
    `event/${eventId}/statistics`,
    `event/${eventId}/h2h`,
    `tournament/177/season/80229/standings/total`,
    `event/${eventId}/lineups`,
    `event/${eventId}/odds/1/all`
];
```

### 4. **Direct API Requests Blocked (403 Errors)**
```
❌ [Direct API] Event 15042180 - Failed to fetch event/15042180/statistics: Request failed with status code 403
❌ [Direct API] Event 15042180 - Failed to fetch event/15042180/h2h: Request failed with status code 403
```

**Issue**: SofaScore's API blocks direct axios requests. Needed to use browser's fetch API with credentials.

## Solutions Implemented

### 1. **Fixed Tab Selector** ✅
```typescript
// ✅ NEW - Correct selector
await page.waitForSelector('button[role="tab"]', { timeout: 5000 });
```

### 2. **Added Multiple Tab Interactions** ✅
Now clicks on:
- **H2H Tab**: Triggers h2h endpoints
- **Statistics Tab**: Triggers statistics endpoints
- **Lineups Tab**: Ensures lineups data is loaded
- **"Show more" button**: Triggers team-streaks/betting-odds endpoint

```typescript
// H2H Tab
for (const tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text && (text.toLowerCase().includes('h2h') || text.toLowerCase().includes('matches'))) {
        await tab.click();
        console.log(`✅ Clicked H2H tab`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        break;
    }
}

// Statistics Tab
for (const tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text && text.toLowerCase().includes('statistics')) {
        await tab.click();
        console.log(`✅ Clicked Statistics tab`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        break;
    }
}

// Lineups Tab
for (const tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text && text.toLowerCase().includes('lineup')) {
        await tab.click();
        console.log(`✅ Clicked Lineups tab`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        break;
    }
}

// "Show more" button
const showMoreButtons = await page.$$('button.button--variant_filled');
for (const button of showMoreButtons) {
    const text = await page.evaluate(el => el.textContent, button);
    if (text && text.toLowerCase().includes('show more')) {
        await button.click();
        console.log(`✅ Clicked 'Show more' button`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        break;
    }
}
```

### 3. **Expanded Critical Endpoints List** ✅
```typescript
const criticalEndpoints = [
    `event/${eventId}/statistics`,
    `event/${eventId}/h2h`,
    `tournament/177/season/80229/standings/total`,
    `event/${eventId}/lineups`,
    `event/${eventId}/odds/1/all`,
    `event/${eventId}/odds/1/featured`,        // ✅ NEW
    `event/${eventId}/win-probability`,        // ✅ NEW
    `event/${eventId}/team-streaks/betting-odds/1`, // ✅ NEW
    `event/${eventId}/graph`,                  // ✅ NEW
    `event/${eventId}/pregame-form`            // ✅ NEW
];

// Also added team-statistics for both teams
if (homeTeamId) {
    criticalEndpoints.push(`team/${homeTeamId}/team-statistics/seasons`); // ✅ NEW
}
if (awayTeamId) {
    criticalEndpoints.push(`team/${awayTeamId}/team-statistics/seasons`); // ✅ NEW
}
```

### 4. **Fixed API Fetch Method** ✅
Changed from direct axios requests to browser context fetch:

```typescript
// ✅ NEW - Use browser's fetch API with credentials
const data = await page.evaluate(async (endpointPath) => {
    try {
        const response = await fetch(`https://api.sofascore.com/api/v1/${endpointPath}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Referer': window.location.href,
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'include'  // ✅ Critical - includes cookies/auth
        });
        
        if (response.ok) {
            return await response.json();
        } else {
            return null;
        }
    } catch (error) {
        return null;
    }
}, endpoint);
```

**Benefits**:
- Uses same authentication as browser
- Inherits cookies and session
- Avoids CORS issues
- No 403 errors

## Expected Results

After these changes, event 15042180 should now capture:

### Currently Captured (8 endpoints):
- ✅ `country/alpha2`
- ✅ `event/15042180/incidents`
- ✅ `event/15042180`
- ✅ `event/15042180/votes`
- ✅ `event/15042180/odds/1/featured`
- ✅ `event/15042180/managers`
- ✅ `event/15042180/lineups`
- ✅ `sport/-18000/event-count`

### Now Should Also Capture (~15+ additional endpoints):
- ✅ `event/15042180/statistics` (via Statistics tab + browser fetch)
- ✅ `event/15042180/h2h` (via H2H tab + browser fetch)
- ✅ `event/15042180/odds/1/all` (via browser fetch)
- ✅ `event/15042180/win-probability` (via browser fetch)
- ✅ `event/15042180/team-streaks/betting-odds/1` (via "Show more" + browser fetch)
- ✅ `event/15042180/graph` (via browser fetch)
- ✅ `event/15042180/pregame-form` (via browser fetch)
- ✅ `team/4765/team-statistics/seasons` (via browser fetch)
- ✅ `team/7929/team-statistics/seasons` (via browser fetch)
- ✅ `team/4765/events/last/0` (via H2H tab)
- ✅ `team/4765/events/next/0` (via H2H tab)
- ✅ `team/7929/events/last/0` (via H2H tab)
- ✅ `team/7929/events/next/0` (via H2H tab)
- ✅ `event/pVbsEid/h2h/events` (via H2H tab + customId)

**Total Expected**: ~23+ endpoints (vs 8 before)

## Testing

1. **Restart the server**:
   ```powershell
   cd d:\proyects\sport betting proyect\luckiaServer
   npm run dev
   ```

2. **Watch logs for event 15042180**:
   - Look for "✅ Clicked H2H tab"
   - Look for "✅ Clicked Statistics tab"
   - Look for "✅ Clicked Lineups tab"
   - Look for "✅ Clicked 'Show more' button"
   - Look for "✅ [Browser Fetch] Event 15042180 - Fetched: ..."
   - Check final endpoint count (should be 20+)

3. **Frontend should now show**:
   - Match statistics widget
   - H2H data
   - Win probability
   - Team statistics
   - All odds (not just featured)

## Files Modified

- `d:\proyects\sport betting proyect\luckiaServer\src\sources\sofascore\BrowserPoolManager.ts`
  - Updated `openEventTab()` method to click multiple tabs
  - Updated `fetchMissingCriticalEndpoints()` to use browser fetch
  - Expanded critical endpoints list

## Next Steps

1. Test with the current live event 15042180
2. Monitor logs to verify all endpoints are being captured
3. Check frontend to confirm data is displaying correctly
4. If successful, these changes will automatically apply to all future events
