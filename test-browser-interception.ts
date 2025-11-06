import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { SofaScoreAPI } from "./src/sources/sofascore/SofaScoreAPI";

// Apply the stealth plugin to make Puppeteer less detectable
puppeteer.use(StealthPlugin());

async function testBrowserInterception() {
    console.log("🚀 Starting SofaScore BROWSER INTERCEPTION test...");
    
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
        
        // Run the browser interception test
        const consolidatedData = await sofaScoreAPI.testBrowserInterceptionFlow();
        
        console.log("🎉 Browser interception test completed!");
        
        // Display the consolidated data structure
        if (consolidatedData && consolidatedData.sofascoreData) {
            console.log("\n📊 BROWSER INTERCEPTION RESULTS:");
            console.log("=".repeat(60));
            
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
                console.log(`  - URL: ${firstEvent.url}`);
                console.log(`  - API Data Categories: ${Object.keys(firstEvent.apiData || {}).length}`);
                console.log(`  - Media URLs: ${Object.keys(firstEvent.media || {}).length} types`);
                
                if (firstEvent.apiData) {
                    console.log(`\n📋 Available API Data:`);
                    Object.keys(firstEvent.apiData).forEach((key: string) => {
                        const hasData = firstEvent.apiData[key] && 
                                      (Array.isArray(firstEvent.apiData[key]) ? firstEvent.apiData[key].length > 0 : 
                                       typeof firstEvent.apiData[key] === 'object' ? Object.keys(firstEvent.apiData[key]).length > 0 : true);
                        console.log(`     ${hasData ? '✅' : '📭'} ${key}`);
                    });
                }
                
                if (firstEvent.media) {
                    console.log(`\n🖼️ Sample Media URLs:`);
                    console.log(`  - Home Team: ${firstEvent.media.teamImages?.home || 'N/A'}`);
                    console.log(`  - Away Team: ${firstEvent.media.teamImages?.away || 'N/A'}`);
                    console.log(`  - Tournament: ${firstEvent.media.tournamentImage || 'N/A'}`);
                    console.log(`  - Home Jersey: ${firstEvent.media.playerJerseys?.home || 'N/A'}`);
                    console.log(`  - Away Jersey: ${firstEvent.media.playerJerseys?.away || 'N/A'}`);
                }
            }
            
            console.log("=".repeat(60));
            
            // Save to file for inspection
            const fs = require('fs').promises;
            await fs.writeFile('browser-interception-results.json', JSON.stringify(consolidatedData, null, 2));
            console.log("📁 Results saved to 'browser-interception-results.json'");
            
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
testBrowserInterception()
    .then(() => {
        console.log("✅ Test script finished");
        process.exit(0);
    })
    .catch((error) => {
        console.error("💥 Test script failed:", error);
        process.exit(1);
    });