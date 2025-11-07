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
        await sofaScoreAPI.testSingleRequestFlow();
        
        console.log("🎉 Single request test completed!");
        
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