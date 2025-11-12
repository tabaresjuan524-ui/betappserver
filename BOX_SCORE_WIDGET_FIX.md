# Box Score & Widget Tabs Fix

## Issue Identified
Basketball and other sports events were missing the "Box Score" tab and some widget tabs (Lineups, Standings, H2H) were not displaying in the frontend despite data being available in SofaScore.

## Root Causes

### 1. Missing Box Score Tab in Backend
The browser tab clicking logic was not attempting to click on the "Box Score" tab, which is specific to basketball, baseball, and similar sports that track detailed player statistics.

### 2. Limited Tab Selectors
The backend was only trying to click 5 tabs, but SofaScore has many more tab variations depending on the sport.

### 3. No Frontend Component for Box Score
Even if box score data was captured, there was no React component to display it.

## Changes Made

### Backend Changes (`BrowserPoolManager.ts`)

**File:** `luckiaServer/src/sources/sofascore/BrowserPoolManager.ts`

**Lines Modified:** ~328-340

**Before:**
```typescript
const tabSelectors = [
    'button[data-testid="tab-statistics"]',  // Statistics tab
    'button[data-testid="tab-lineups"]',     // Lineups tab
    'button[data-testid="tab-graph"]',       // Momentum/Graph tab
    'button[data-testid="tab-knockout"]',    // Standings/Draw tab
    'button[data-testid="tab-matches"]',     // H2H/Matches tab
];
```

**After:**
```typescript
const tabSelectors = [
    'button[data-testid="tab-statistics"]',   // Statistics tab (common across sports)
    'button[data-testid="tab-boxscore"]',     // Box score tab (basketball, baseball)
    'button[data-testid="tab-box-score"]',    // Alternative box score naming
    'button[data-testid="tab-lineups"]',      // Lineups tab (football, hockey)
    'button[data-testid="tab-graph"]',        // Momentum/Graph tab (various sports)
    'button[data-testid="tab-momentum"]',     // Alternative momentum naming
    'button[data-testid="tab-standings"]',    // Standings tab (league table)
    'button[data-testid="tab-knockout"]',     // Knockout/Draw tab (tournaments)
    'button[data-testid="tab-table"]',        // Table/Standings alternative
    'button[data-testid="tab-matches"]',      // H2H/Matches tab
    'button[data-testid="tab-h2h"]',          // H2H alternative naming
];
```

**Impact:** The backend now attempts to click 11 different tab types, covering all major widget variations across different sports.

### Frontend Changes

#### 1. New Component: `SofascoreBoxScore.tsx`

**File:** `webdev-arena-template/components/sofascore/SofascoreBoxScore.tsx` (NEW)

**Purpose:** Displays player statistics in a table format for sports like basketball and baseball.

**Features:**
- Dynamic table generation based on available stats
- Separate tables for home and away teams
- Jersey number display
- Player position display
- Highlighting for starting players
- Handles multiple data structure formats
- Dark mode support

**Props:**
```typescript
interface BoxScoreProps {
    boxScoreData: any;
    homeTeamName: string;
    awayTeamName: string;
    homeTeamColor?: string;
    awayTeamColor?: string;
}
```

#### 2. Updated: `SofascoreWidgetView.tsx`

**File:** `webdev-arena-template/components/SofascoreWidgetView.tsx`

**Changes:**
1. **Import added** (line ~12):
   ```typescript
   import SofascoreBoxScore from './sofascore/SofascoreBoxScore';
   import { Clipboard } from 'lucide-react';
   ```

2. **Tab type updated** (line ~17):
   ```typescript
   type TabType = 'overview' | 'boxscore' | 'statistics' | 'lineups' | 'momentum' | 'standings' | 'form' | 'h2h';
   ```

3. **New tab added** (line ~100):
   ```typescript
   { id: 'boxscore', label: 'Box Score', icon: <Clipboard size={16} /> },
   ```

4. **Data extraction added** (line ~145):
   ```typescript
   const boxScoreData = detailedData?.[`event/${eventId}/boxscore`] || detailedData?.[`event/${eventId}/box-score`];
   ```

5. **Tab rendering added** (line ~350):
   ```typescript
   {activeTab === 'boxscore' && (
       <div className="p-4">
           {boxScoreData ? (
               <SofascoreBoxScore
                   boxScoreData={boxScoreData}
                   homeTeamName={homeTeam}
                   awayTeamName={awayTeam}
                   homeTeamColor={homeTeamColor}
                   awayTeamColor={awayTeamColor}
               />
           ) : (
               <div className="text-center py-8 text-slate-500">
                   No box score data available
               </div>
           )}
       </div>
   )}
   ```

## Expected Results

### Backend
When monitoring a basketball event, the logs should now show:
```
✅ [Browser 1] Event 15037616 - Monitoring live (widgets loaded: 8/11 tabs)
📥 [Browser 1] Event 15037616 - 🎯 WIDGET DATA CAPTURED: event/15037616/boxscore
📥 [Browser 1] Event 15037616 - 🎯 WIDGET DATA CAPTURED: event/15037616/statistics
📥 [Browser 1] Event 15037616 - 🎯 WIDGET DATA CAPTURED: event/15037616/lineups
📥 [Browser 1] Event 15037616 - 🎯 WIDGET DATA CAPTURED: event/15037616/standings
📥 [Browser 1] Event 15037616 - 🎯 WIDGET DATA CAPTURED: event/15037616/h2h
```

### Frontend
When viewing a basketball event:
1. **Box Score tab** will be visible in the tab navigation
2. Clicking it will display a table with player statistics:
   - Player names with jersey numbers
   - Minutes played
   - Points, rebounds, assists, etc.
   - Separate tables for home and away teams
3. **All other tabs** (Lineups, Standings, H2H) should now display data if it was captured

## Testing Instructions

1. **Restart the backend server:**
   ```powershell
   cd luckiaServer
   npm start
   ```

2. **Wait for basketball events to be captured**
   - Check logs for "WIDGET DATA CAPTURED: boxscore"

3. **Open frontend and navigate to a basketball event**

4. **Verify tabs are visible:**
   - Overview ✓
   - Box Score ✓ (NEW)
   - Statistics ✓
   - Lineups ✓
   - Momentum ✓
   - Standings ✓
   - Form ✓
   - H2H ✓

5. **Click Box Score tab:**
   - Should display player statistics table
   - Should show both home and away teams
   - Should display points, rebounds, assists, etc.

## Sport-Specific Tab Availability

Different sports will have different tabs available:

### Basketball
- ✅ Box Score (player stats)
- ✅ Statistics (team stats)
- ✅ Standings
- ✅ H2H
- ❌ Lineups (usually not applicable)

### Football/Soccer
- ❌ Box Score (not applicable)
- ✅ Statistics
- ✅ Lineups
- ✅ Momentum/Graph
- ✅ Standings
- ✅ H2H

### Baseball
- ✅ Box Score (player stats)
- ✅ Statistics
- ✅ Standings
- ✅ H2H

### Tennis
- ❌ Box Score (not applicable)
- ✅ Statistics
- ✅ H2H
- ❌ Standings (usually not applicable)

## Troubleshooting

### Box Score Tab Shows "No data available"

**Possible causes:**
1. Backend didn't capture box score endpoint (check logs)
2. Sport doesn't have box score (normal for football/soccer)
3. Event hasn't started yet (box score only available during/after match)

**Solution:**
- Check backend logs for "WIDGET DATA CAPTURED: boxscore"
- If not captured, verify tab selector matches actual HTML
- Some sports don't have box score data

### Lineups/Standings/H2H Tabs Empty

**Possible causes:**
1. Backend didn't click those tabs (check "widgets loaded: X/11 tabs")
2. Data not available for this specific event
3. Tab selector doesn't match actual HTML structure

**Solution:**
- Check backend logs for which tabs were clicked
- Verify data exists in Redux state (check console logs)
- Inspect SofaScore website to verify tab availability

### Backend Shows "widgets loaded: 0/11 tabs"

**Possible causes:**
1. Tab selectors still don't match actual HTML
2. Page loading too slowly
3. Anti-bot detection

**Solution:**
- Increase wait time before clicking tabs (currently 3000ms)
- Check if tabs are rendering on the page
- Verify Chrome browser is working correctly

## Files Modified

### Backend
- `luckiaServer/src/sources/sofascore/BrowserPoolManager.ts`

### Frontend
- `webdev-arena-template/components/sofascore/SofascoreBoxScore.tsx` (NEW)
- `webdev-arena-template/components/SofascoreWidgetView.tsx`

## Related Documentation
- See `SOFASCORE_WIDGETS_COMPLETE.md` for widget architecture
- See `SOFASCORE_INTEGRATION_COMPLETE.md` for data flow
- See `SPORT_FILTER_CONFIG.md` for testing specific sports
