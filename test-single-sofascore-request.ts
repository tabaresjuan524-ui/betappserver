import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { SofaScoreAPI } from "./src/sources/sofascore/SofaScoreAPI";

// Apply the stealth plugin to make Puppeteer less detectable
puppeteer.use(StealthPlugin());

async function testSingleSofaScoreRequest() {
    console.log("🚀 Starting SINGLE REQUEST test for SofaScore...");
    
    let browser = null;
    try {
        console.log("🔄 Launching browser...");
        browser = await puppeteer.launch({
            headless: false, // Set to false so you can see the browser
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        });

        console.log("✅ Browser launched successfully");
        
        // Create SofaScore API instance
        const sofaScoreAPI = new SofaScoreAPI(browser);
        
        // Run the single request test
        const consolidatedData = await sofaScoreAPI.testSingleRequestFlow();
        
        console.log("🎉 Single request test completed!");
        
        // Display the consolidated data structure
        if (consolidatedData && consolidatedData.sofascoreData) {
            console.log("\n📊 CONSOLIDATED SOFASCORE DATA STRUCTURE:");
            console.log("=".repeat(60));
            
            // Show structure overview
            const { sofascoreData } = consolidatedData;
            console.log(`📅 Events: ${Object.keys(sofascoreData.events || {}).length}`);
            console.log(`⚽ Teams: ${Object.keys(sofascoreData.teams || {}).length}`);
            console.log(`🏆 Tournaments: ${Object.keys(sofascoreData.tournaments || {}).length}`);
            console.log(`🖼️ Media URLs Generated: ${Object.keys(sofascoreData.media || {}).length}`);
            
            // Show sample event data
            const eventKeys = Object.keys(sofascoreData.events || {});
            if (eventKeys.length > 0) {
                const firstEventId = eventKeys[0];
                const firstEvent = sofascoreData.events[firstEventId];
                console.log(`\n🎯 Sample Event (${firstEventId}):`);
                console.log(`  - Basic Data: ${firstEvent.basicData ? '✅' : '❌'}`);
                console.log(`  - Statistics: ${firstEvent.statistics ? '✅' : '❌'}`);
                console.log(`  - Incidents: ${firstEvent.incidents ? '✅' : '❌'}`);
                console.log(`  - Odds: ${firstEvent.odds ? '✅' : '❌'}`);
                console.log(`  - Lineups: ${firstEvent.lineups ? '✅' : '❌'}`);
            }
            
            // Show sample media URLs
            const mediaKeys = Object.keys(sofascoreData.media || {});
            if (mediaKeys.length > 0) {
                console.log(`\n🖼️ Sample Media URLs:`);
                mediaKeys.slice(0, 3).forEach(key => {
                    console.log(`  - ${key}: ${sofascoreData.media[key]}`);
                });
            }
            
            console.log("=".repeat(60));
        } else {
            console.log("❌ No consolidated data returned");
        }
        
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
testSingleSofaScoreRequest()
    .then(() => {
        console.log("✅ Test script finished");
        process.exit(0);
    })
    .catch((error) => {
        console.error("💥 Test script failed:", error);
        process.exit(1);
    });