# Sport Filter Configuration

## Overview
Added a configurable sport filter to `SofaScoreAPIFetcher` for easier development and testing. This allows you to focus on specific sports instead of fetching data from all available sports.

## Configuration Variables

### 1. `SPORT_FILTER` (NEW)
**Location:** `luckiaServer/src/sources/sofascore/SofaScoreAPIFetcher.ts` (line ~92)

**Type:** `string`

**Default:** `'all'`

**Options:**
- `'all'` - Fetch all sports with live events (default production setting)
- `'football'` - Only fetch football/soccer events
- `'basketball'` - Only fetch basketball events
- `'tennis'` - Only fetch tennis events
- `'table-tennis'` - Only fetch table tennis events
- `'badminton'` - Only fetch badminton events
- Any other valid sport slug from SofaScore

### 2. `MAX_EVENTS_PER_SPORT` (Existing)
**Location:** `luckiaServer/src/sources/sofascore/SofaScoreAPIFetcher.ts` (line ~86)

**Type:** `number`

**Default:** `5`

**Options:**
- `0` - Unlimited events per sport
- `5-10` - Recommended for testing to prevent memory issues
- Any positive number to limit events per sport

## Usage Examples

### Example 1: Test Only Basketball
```typescript
private readonly MAX_EVENTS_PER_SPORT: number = 5;
private readonly SPORT_FILTER: string = 'basketball';
```
**Result:** Fetches only 5 basketball events, ignoring all other sports.

### Example 2: Test Football with More Events
```typescript
private readonly MAX_EVENTS_PER_SPORT: number = 10;
private readonly SPORT_FILTER: string = 'football';
```
**Result:** Fetches up to 10 football events, ignoring all other sports.

### Example 3: Production Mode - All Sports
```typescript
private readonly MAX_EVENTS_PER_SPORT: number = 0;
private readonly SPORT_FILTER: string = 'all';
```
**Result:** Fetches unlimited events from all sports with live matches.

### Example 4: Limited Testing Across All Sports
```typescript
private readonly MAX_EVENTS_PER_SPORT: number = 3;
private readonly SPORT_FILTER: string = 'all';
```
**Result:** Fetches up to 3 events per sport from all available sports.

## Console Output

When the sport filter is active, you'll see these log messages:

```
🚀 [SOFASCORE] Starting data fetch cycle...
⚙️  [SOFASCORE] Max events per sport: 5
🎯 [SOFASCORE] Sport filter: basketball
🎯 [SOFASCORE] Sport filter applied: 12 sports -> 1 sport(s) (basketball)
```

If no events are found for the filtered sport:
```
⚠️  [SOFASCORE] No live events found for sport: basketball
```

## How It Works

1. The system fetches the event count for ALL sports from SofaScore
2. It identifies which sports have live events
3. **NEW:** If `SPORT_FILTER` is set (not 'all'), it filters the list to only include the specified sport
4. It then proceeds to fetch and monitor only the filtered sport(s)
5. The `MAX_EVENTS_PER_SPORT` limit is still applied to each sport

## Benefits

✅ **Faster Development:** Focus on one sport at a time  
✅ **Reduced Memory Usage:** Fewer browser tabs open  
✅ **Easier Debugging:** Less console noise from multiple sports  
✅ **Faster Restarts:** Quicker initialization with fewer events  
✅ **Targeted Testing:** Test specific sport widget fixes

## Common Sport Slugs

Based on SofaScore's API, common sport slugs include:
- `football` (soccer)
- `basketball`
- `tennis`
- `american-football`
- `baseball`
- `ice-hockey`
- `volleyball`
- `handball`
- `table-tennis`
- `badminton`
- `esports`
- `cricket`
- `rugby`
- `motorsport`

## Modifying the Configuration

1. Open `luckiaServer/src/sources/sofascore/SofaScoreAPIFetcher.ts`
2. Find the configuration section around line 86-92
3. Change the values:
   ```typescript
   private readonly SPORT_FILTER: string = 'basketball'; // Change this
   ```
4. Save the file
5. Restart the server to apply changes

**Note:** These are compile-time constants, so you must restart the server for changes to take effect.

## Reverting to Default

To return to production mode (all sports, unlimited events):
```typescript
private readonly MAX_EVENTS_PER_SPORT: number = 0;
private readonly SPORT_FILTER: string = 'all';
```
