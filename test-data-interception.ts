import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { SofaScoreDataInterceptor } from "./src/sources/sofascore/SofaScoreDataInterceptor";

// Apply the stealth plugin to make Puppeteer less detectable
puppeteer.use(StealthPlugin());

async function testDataInterception() {
    console.log("🚀 Starting SofaScore DATA INTERCEPTION test...");
    
    let browser = null;
    try {
        console.log("🔄 Launching browser...");
        browser = await puppeteer.launch({
            headless: false, // Set to false so you can see the browser
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        });

        console.log("✅ Browser launched successfully");
        
        // Create interceptor instance
        const interceptor = new SofaScoreDataInterceptor(browser);
        
        // Start data collection
        const result = await interceptor.collectSportsAndEvents();
        
        console.log("\n📊 COLLECTION RESULTS:");
        console.log("=".repeat(60));
        
        const { consolidatedData } = result;
        
        // Display summary
        console.log(`🏈 Sports collected: ${Object.keys(consolidatedData.sports).length}`);
        console.log(`🎯 Events collected: ${Object.keys(consolidatedData.events).length}`);
        console.log(`👥 Teams found: ${Object.keys(consolidatedData.teams).length}`);
        console.log(`🏆 Tournaments found: ${Object.keys(consolidatedData.tournaments).length}`);
        console.log(`🖼️ Media URLs generated: ${Object.keys(consolidatedData.media).length}`);
        
        // Show sample data for first event
        const eventIds = Object.keys(consolidatedData.events);
        if (eventIds.length > 0) {
            const firstEventId = eventIds[0];
            const firstEvent = consolidatedData.events[firstEventId];
            
            console.log(`\n🎯 Sample Event Data (${firstEventId}):`);
            console.log(`  - Basic Info: ${firstEvent.basicInfo ? '✅' : '❌'}`);
            console.log(`  - API Responses: ${Object.keys(firstEvent.apiResponses || {}).length} endpoints`);
            console.log(`  - Media URLs: ${Object.keys(firstEvent.media || {}).length} types`);
            
            if (firstEvent.apiResponses) {
                console.log(`\n📋 Available API Data:`);
                Object.keys(firstEvent.apiResponses).forEach(key => {
                    console.log(`     ✅ ${key}`);
                });
            }
            
            if (firstEvent.media) {
                console.log(`\n🖼️ Media URLs:`);
                console.log(`     🏠 Home Team: ${firstEvent.media.teamImages?.home || 'N/A'}`);
                console.log(`     🚶 Away Team: ${firstEvent.media.teamImages?.away || 'N/A'}`);
                console.log(`     🏆 Tournament: ${firstEvent.media.tournamentImage || 'N/A'}`);
            }
        }
        
        // Export to file for inspection
        await interceptor.exportToFile(consolidatedData, 'sofascore-intercepted-data.json');
        
        console.log("\n🎉 Data interception test completed!");
        
    } catch (error) {
        console.error("💥 Error during test:", error);
    } finally {
        if (browser) {
            console.log("🔄 Closing browser...");
            await browser.close();
            console.log("✅ Browser closed");
        }
    }
}

// Run the test
testDataInterception()
    .then(() => {
        console.log("✅ Test script finished");
        process.exit(0);
    })
    .catch((error) => {
        console.error("💥 Test script failed:", error);
        process.exit(1);
    });