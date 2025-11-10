const fs = require('fs');
const path = require('path');

// Get the latest data file
const sofascoreDir = path.join(__dirname, 'sofascore');
const files = fs.readdirSync(sofascoreDir)
    .filter(f => f.startsWith('sofascore-data-') && f.endsWith('.json'))
    .sort()
    .reverse();

if (files.length === 0) {
    console.log('❌ No sofascore data files found');
    process.exit(1);
}

const latestFile = files[0];
console.log(`📁 Analyzing: ${latestFile}\n`);

const data = JSON.parse(fs.readFileSync(path.join(sofascoreDir, latestFile), 'utf-8'));

console.log('═══════════════════════════════════════════════════════════');
console.log('            SOFASCORE SCRAPER DATA ANALYSIS');
console.log('═══════════════════════════════════════════════════════════\n');

// Event Counts Analysis
console.log('📊 EVENT COUNTS BY SPORT (Live Events):');
console.log('─────────────────────────────────────────────────────────');
let totalLive = 0;
let totalAll = 0;
const sportsWithLive = [];

Object.entries(data.eventCount).forEach(([sport, counts]) => {
    if (counts.live > 0) {
        console.log(`  ✅ ${sport.padEnd(20)} ${String(counts.live).padStart(3)} live / ${String(counts.total).padStart(5)} total`);
        totalLive += counts.live;
        sportsWithLive.push(sport);
    }
    totalAll += counts.total;
});

console.log('─────────────────────────────────────────────────────────');
console.log(`  📈 TOTAL:              ${String(totalLive).padStart(3)} live / ${String(totalAll).padStart(5)} total events`);
console.log(`  🏅 Sports with live:   ${sportsWithLive.length} sports\n`);

// Processed Events Analysis
console.log('🔍 INTERCEPTED EVENTS & ENDPOINTS:');
console.log('─────────────────────────────────────────────────────────');
let totalIntercepted = 0;
let totalEndpoints = 0;
let successRate = {};

Object.entries(data.sports).forEach(([sport, sportData]) => {
    const eventCount = Object.keys(sportData.events).length;
    const liveEventCount = sportData.liveEvents?.events?.length || 0;
    
    if (eventCount > 0) {
        let endpointCount = 0;
        Object.values(sportData.events).forEach(event => {
            endpointCount += Object.keys(event).length;
        });
        
        const avgEndpoints = (endpointCount / eventCount).toFixed(1);
        const successPct = liveEventCount > 0 ? ((eventCount / liveEventCount) * 100).toFixed(0) : '100';
        
        console.log(`  ${sport.padEnd(20)} ${String(liveEventCount).padStart(3)} live → ${String(eventCount).padStart(3)} intercepted (${successPct}%) | ${String(endpointCount).padStart(4)} endpoints (avg: ${avgEndpoints})`);
        
        totalIntercepted += eventCount;
        totalEndpoints += endpointCount;
        successRate[sport] = { intercepted: eventCount, live: liveEventCount, endpoints: endpointCount };
    }
});

const avgEndpointsPerEvent = totalIntercepted > 0 ? (totalEndpoints / totalIntercepted).toFixed(1) : 0;

console.log('─────────────────────────────────────────────────────────');
console.log(`  📡 TOTAL INTERCEPTED:  ${totalIntercepted} events`);
console.log(`  🔗 TOTAL ENDPOINTS:    ${totalEndpoints} API calls captured`);
console.log(`  📊 AVERAGE:            ${avgEndpointsPerEvent} endpoints per event\n`);

// Endpoint Types Analysis
console.log('📋 UNIQUE ENDPOINT TYPES CAPTURED:');
console.log('─────────────────────────────────────────────────────────');
const allEndpoints = new Set();

Object.values(data.sports).forEach(sportData => {
    Object.values(sportData.events).forEach(event => {
        Object.keys(event).forEach(endpoint => allEndpoints.add(endpoint));
    });
});

const endpointsByCategory = {};
allEndpoints.forEach(endpoint => {
    // Categorize endpoints
    if (endpoint.includes('event/') && endpoint.includes('/lineups')) {
        endpointsByCategory['👥 Lineups'] = endpointsByCategory['👥 Lineups'] || new Set();
        endpointsByCategory['👥 Lineups'].add(endpoint);
    } else if (endpoint.includes('event/') && (endpoint.includes('/statistics') || endpoint.includes('/graph'))) {
        endpointsByCategory['📊 Statistics'] = endpointsByCategory['📊 Statistics'] || new Set();
        endpointsByCategory['📊 Statistics'].add(endpoint);
    } else if (endpoint.includes('event/') && (endpoint.includes('/incidents') || endpoint.includes('/highlights'))) {
        endpointsByCategory['⚡ Live Events'] = endpointsByCategory['⚡ Live Events'] || new Set();
        endpointsByCategory['⚡ Live Events'].add(endpoint);
    } else if (endpoint.includes('event/') && (endpoint.includes('/odds') || endpoint.includes('/betting'))) {
        endpointsByCategory['💰 Betting/Odds'] = endpointsByCategory['💰 Betting/Odds'] || new Set();
        endpointsByCategory['💰 Betting/Odds'].add(endpoint);
    } else if (endpoint.includes('event/') && (endpoint.includes('/h2h') || endpoint.includes('/team-streaks'))) {
        endpointsByCategory['� History'] = endpointsByCategory['� History'] || new Set();
        endpointsByCategory['🔄 History'].add(endpoint);
    } else if (endpoint.includes('event/') && (endpoint.includes('/votes') || endpoint.includes('/comments'))) {
        endpointsByCategory['💬 Social'] = endpointsByCategory['💬 Social'] || new Set();
        endpointsByCategory['💬 Social'].add(endpoint);
    } else if (endpoint.includes('event/') && (endpoint.includes('/managers') || endpoint.includes('/best-players'))) {
        endpointsByCategory['🏆 Team/Player Info'] = endpointsByCategory['🏆 Team/Player Info'] || new Set();
        endpointsByCategory['🏆 Team/Player Info'].add(endpoint);
    } else if (endpoint.startsWith('event/')) {
        endpointsByCategory['📋 Event Details'] = endpointsByCategory['📋 Event Details'] || new Set();
        endpointsByCategory['� Event Details'].add(endpoint);
    } else {
        endpointsByCategory['📡 Other'] = endpointsByCategory['📡 Other'] || new Set();
        endpointsByCategory['📡 Other'].add(endpoint);
    }
});

Object.entries(endpointsByCategory).forEach(([category, endpoints]) => {
    console.log(`\n  ${category} (${endpoints.size}):`);
    Array.from(endpoints).forEach(ep => console.log(`    • ${ep}`));
});

console.log('\n─────────────────────────────────────────────────────────');
console.log(`  🔗 UNIQUE ENDPOINTS:   ${allEndpoints.size} different endpoint types\n`);

// Sample Event Data
console.log('💡 SAMPLE EVENT DATA:');
console.log('─────────────────────────────────────────────────────────');
const sampleSport = Object.keys(data.sports)[0];
const sampleEvent = data.sports[sampleSport].liveEvents?.events?.[0];
const sampleEventId = Object.keys(data.sports[sampleSport].events)[0];
const sampleIntercepted = data.sports[sampleSport].events[sampleEventId];

if (sampleEvent) {
    console.log(`  Sport: ${sampleSport}`);
    console.log(`  Event ID: ${sampleEventId}`);
    console.log(`  Match: ${sampleEvent.homeTeam?.name || 'N/A'} vs ${sampleEvent.awayTeam?.name || 'N/A'}`);
    console.log(`  Status: ${sampleEvent.status?.description || 'N/A'}`);
    console.log(`  Score: ${sampleEvent.homeScore?.display || 0} - ${sampleEvent.awayScore?.display || 0}`);
    console.log(`  Tournament: ${sampleEvent.tournament?.name || 'N/A'}`);
    console.log(`  Intercepted Endpoints: ${Object.keys(sampleIntercepted).length}`);
    console.log(`  Endpoints: ${Object.keys(sampleIntercepted).join(', ')}`);
}

console.log('\n─────────────────────────────────────────────────────────');
console.log(`  ⏰ Last Update: ${data.lastUpdate}`);
console.log('─────────────────────────────────────────────────────────\n');

// Summary
console.log('📝 SUMMARY:');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  ✅ Successfully intercepting data from ${Object.keys(data.sports).length} sports`);
console.log(`  ✅ Processing ${totalLive} live events (${totalAll} total events in system)`);
console.log(`  ✅ Captured ${totalIntercepted} events with ${totalEndpoints} API endpoint responses`);
console.log(`  ✅ Discovered ${allEndpoints.size} unique endpoint types`);
console.log(`  ✅ Average ${avgEndpointsPerEvent} endpoints captured per event`);
console.log('═══════════════════════════════════════════════════════════\n');
