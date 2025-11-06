import * as dotenv from 'dotenv';
import { initializeWebSocketServer } from './common/websocketServer';
import { startDataFetching } from './sources';
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Browser } from 'puppeteer';

// Initialize environment variables from .env file
dotenv.config();

// Apply the stealth plugin to make Puppeteer less detectable
puppeteer.use(StealthPlugin());

const main = async () => {
    console.log("🚀 Starting the application...");

    const port = parseInt(process.env.PORT || '8080', 10);
    initializeWebSocketServer(port);

    let browser: Browser | null = null;
    const useMockData = process.env.USE_MOCK_DATA === 'true';

    if (!useMockData) {
        console.log(" launching persistent stealth Puppeteer browser...");
        browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
            protocolTimeout: 180000, // 3 minutes - increased to prevent protocol timeouts during heavy scraping
        });
    } else {
        console.log("🟢 Running in MOCK DATA mode, browser will not be launched.");
    }
    
    // Start the main data fetching loop
    startDataFetching(browser);
    
    // Graceful shutdown
    process.on("SIGINT", async () => {
        console.log("\n🔌 Shutting down gracefully...");
        if (browser) {
            await browser.close();
            console.log("Browser closed.");
        }
        console.log("Server shut down.");
        process.exit(0);
    });
};

main().catch(error => {
    console.error("💥 An unexpected error occurred:", error);
    process.exit(1);
});