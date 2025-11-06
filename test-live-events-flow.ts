import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { SofaScoreAPI } from './src/sources/sofascore/SofaScoreAPI';
import fs from 'fs';

// Add stealth plugin
puppeteer.use(StealthPlugin());

async function testLiveEventsFlow() {
    console.log(`\n🏈 ============ TESTING LIVE EVENTS FLOW ============`);
    console.log(`🎯 API → Sport Pages → En Vivo → Events → Data`);
    console.log(`================================================\n`);

    let browser;
    try {
        // Launch browser in headless mode with increased timeout
        console.log(`🚀 Launching headless browser with extended timeout...`);
        browser = await puppeteer.launch({
            headless: true,
            protocolTimeout: 120000, // 2 minutes protocol timeout
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-dev-shm-usage',
                '--no-first-run'
            ]
        });

        console.log(`✅ Browser launched successfully with extended timeout`);

        // Initialize SofaScore API
        const sofaScoreAPI = new SofaScoreAPI(browser);

        // Test the new live events flow
        console.log(`\n🔵 Starting live events collection flow...`);
        const startTime = Date.now();
        
        const result = await sofaScoreAPI.getLiveEventsFromAllSports();
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.log(`\n🏈 ================= LIVE EVENTS FLOW COMPLETED =================`);
        console.log(`⏱️ Total Duration: ${duration}s`);
        console.log(`📊 FINAL RESULTS:`);
        
        const { sofascoreData } = result;
        
        console.log(`   🎯 Events Processed: ${Object.keys(sofascoreData.events).length}`);
        console.log(`   👥 Teams Collected: ${Object.keys(sofascoreData.teams).length}`);
        console.log(`   🏆 Tournaments Collected: ${Object.keys(sofascoreData.tournaments).length}`);
        
        // Calculate total API calls intercepted
        let totalApiCalls = 0;
        Object.values(sofascoreData.events).forEach((event: any) => {
            totalApiCalls += Object.keys(event.apiData).length;
        });
        
        console.log(`   📡 Total API Calls Intercepted: ${totalApiCalls}`);

        // Show detailed event data
        const eventIds = Object.keys(sofascoreData.events);
        if (eventIds.length > 0) {
            console.log(`\n📋 EVENT DETAILS:`);
            eventIds.forEach(eventId => {
                const event = sofascoreData.events[eventId];
                console.log(`\n   Event ID: ${event.id}`);
                console.log(`   URL: ${event.url}`);
                console.log(`   API Data Categories: ${Object.keys(event.apiData).join(', ')}`);
                
                if (event.apiData.eventDetails?.event) {
                    const eventInfo = event.apiData.eventDetails.event;
                    console.log(`   Match: ${eventInfo.homeTeam?.name} vs ${eventInfo.awayTeam?.name}`);
                    console.log(`   Tournament: ${eventInfo.tournament?.uniqueTournament?.name}`);
                    console.log(`   Status: ${eventInfo.status?.description}`);
                    if (eventInfo.homeScore && eventInfo.awayScore) {
                        console.log(`   Score: ${eventInfo.homeScore.current || 0} - ${eventInfo.awayScore.current || 0}`);
                    }
                }
                
                console.log(`   Media URLs:`);
                console.log(`     - Home Team: ${event.media.teamImages?.home || 'N/A'}`);
                console.log(`     - Away Team: ${event.media.teamImages?.away || 'N/A'}`);
                console.log(`     - Tournament: ${event.media.tournamentImage || 'N/A'}`);
                console.log(`     - Home Jersey: ${event.media.playerJerseys?.home || 'N/A'}`);
                console.log(`     - Away Jersey: ${event.media.playerJerseys?.away || 'N/A'}`);
            });
        }

        // Show team data
        const teamIds = Object.keys(sofascoreData.teams);
        if (teamIds.length > 0) {
            console.log(`\n👥 TEAMS COLLECTED:`);
            teamIds.forEach(teamId => {
                const team = sofascoreData.teams[teamId];
                console.log(`   ${team.name} (ID: ${team.id}) - ${team.imageUrl}`);
            });
        }

        // Show tournament data
        const tournamentIds = Object.keys(sofascoreData.tournaments);
        if (tournamentIds.length > 0) {
            console.log(`\n🏆 TOURNAMENTS COLLECTED:`);
            tournamentIds.forEach(tournamentId => {
                const tournament = sofascoreData.tournaments[tournamentId];
                console.log(`   ${tournament.name} (ID: ${tournament.id}) - ${tournament.imageUrl}`);
            });
        }

        // Save results to file
        const filename = `live-events-flow-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        fs.writeFileSync(filename, JSON.stringify(sofascoreData, null, 2));
        console.log(`\n💾 Results saved to: ${filename}`);

        console.log(`\n🎉 LIVE EVENTS FLOW TEST COMPLETED SUCCESSFULLY!`);
        console.log(`📦 Data ready for WebSocket transmission to frontend`);
        console.log(`==================================================\n`);

    } catch (error) {
        console.error(`\n❌ ERROR in live events flow test:`, error);
        if (error instanceof Error) {
            console.error(`   Message: ${error.message}`);
            console.error(`   Stack: ${error.stack}`);
        }
        
        // Log specific puppeteer timeout errors
        if (error instanceof Error && error.message.includes('timeout')) {
            console.error(`\n🔍 TIMEOUT ERROR ANALYSIS:`);
            console.error(`   - This might be due to slow network or heavy page loading`);
            console.error(`   - Consider increasing protocolTimeout in browser launch`);
            console.error(`   - Or reducing the number of events processed simultaneously`);
        }
    } finally {
        if (browser) {
            console.log(`🔄 Closing browser...`);
            await browser.close();
            console.log(`✅ Browser closed`);
        }
    }
}

// Run the test
testLiveEventsFlow().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});