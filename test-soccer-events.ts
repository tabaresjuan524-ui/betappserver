import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { SofaScoreAPI } from './src/sources/sofascore/SofaScoreAPI';
import fs from 'fs';

// Add stealth plugin
puppeteer.use(StealthPlugin());

async function testSoccerEventsCollection() {
    console.log(`\n⚽ ========== TESTING SOCCER EVENTS DATA COLLECTION ==========`);
    console.log(`🎯 Using headless browser interception for comprehensive data`);
    console.log(`============================================================\n`);

    let browser;
    try {
        // Launch browser in headless mode for production
        console.log(`🚀 Launching headless browser...`);
        browser = await puppeteer.launch({
            headless: true, // Set to true for production/headless mode
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        });

        console.log(`✅ Browser launched successfully in headless mode`);

        // Initialize SofaScore API
        const sofaScoreAPI = new SofaScoreAPI(browser);

        // Test the new soccer events data collection
        console.log(`\n🔵 Starting comprehensive soccer data collection...`);
        const startTime = Date.now();
        
        const result = await sofaScoreAPI.getSoccerEventsData();
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.log(`\n⚽ ================= SOCCER DATA COLLECTION COMPLETED =================`);
        console.log(`⏱️ Collection Duration: ${duration}s`);
        console.log(`📊 FINAL RESULTS:`);
        
        const { sofascoreData } = result;
        
        console.log(`   🎯 Soccer Events: ${Object.keys(sofascoreData.events).length} events`);
        console.log(`   👥 Teams: ${Object.keys(sofascoreData.teams).length} teams`);
        console.log(`   🏆 Tournaments: ${Object.keys(sofascoreData.tournaments).length} tournaments`);
        
        // Calculate total API calls intercepted
        let totalApiCalls = 0;
        Object.values(sofascoreData.events).forEach((event: any) => {
            totalApiCalls += Object.keys(event.apiData).length;
        });
        
        console.log(`   📡 Total API Calls Intercepted: ${totalApiCalls}`);
        console.log(`   🖼️ Media URLs Generated: Teams + Tournaments + Jerseys`);

        // Show sample event data
        const eventIds = Object.keys(sofascoreData.events);
        if (eventIds.length > 0) {
            console.log(`\n📋 SAMPLE EVENT DATA:`);
            const sampleEvent = sofascoreData.events[eventIds[0]];
            console.log(`   Event ID: ${sampleEvent.id}`);
            console.log(`   URL: ${sampleEvent.url}`);
            console.log(`   Data Categories: ${Object.keys(sampleEvent.apiData).join(', ')}`);
            
            if (sampleEvent.apiData.eventDetails?.event) {
                const event = sampleEvent.apiData.eventDetails.event;
                console.log(`   Match: ${event.homeTeam?.name} vs ${event.awayTeam?.name}`);
                console.log(`   Tournament: ${event.tournament?.uniqueTournament?.name}`);
                console.log(`   Status: ${event.status?.description}`);
            }
        }

        // Show sample team data
        const teamIds = Object.keys(sofascoreData.teams);
        if (teamIds.length > 0) {
            console.log(`\n👥 SAMPLE TEAM DATA:`);
            teamIds.slice(0, 3).forEach(teamId => {
                const team = sofascoreData.teams[teamId];
                console.log(`   ${team.name} (ID: ${team.id}) - Image: ${team.imageUrl}`);
            });
        }

        // Show sample tournament data
        const tournamentIds = Object.keys(sofascoreData.tournaments);
        if (tournamentIds.length > 0) {
            console.log(`\n🏆 SAMPLE TOURNAMENT DATA:`);
            tournamentIds.slice(0, 3).forEach(tournamentId => {
                const tournament = sofascoreData.tournaments[tournamentId];
                console.log(`   ${tournament.name} (ID: ${tournament.id}) - Image: ${tournament.imageUrl}`);
            });
        }

        // Save results to file
        const filename = `soccer-events-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        fs.writeFileSync(filename, JSON.stringify(sofascoreData, null, 2));
        console.log(`\n💾 Results saved to: ${filename}`);

        console.log(`\n🎉 SOCCER DATA COLLECTION TEST COMPLETED SUCCESSFULLY!`);
        console.log(`📦 Comprehensive data ready for WebSocket transmission to frontend`);
        console.log(`================================================================\n`);

    } catch (error) {
        console.error(`\n❌ ERROR in soccer events collection test:`, error);
        if (error instanceof Error) {
            console.error(`   Stack: ${error.stack}`);
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
testSoccerEventsCollection().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});