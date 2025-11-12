import * as dotenv from 'dotenv';
import { initializeWebSocketServer } from './common/websocketServer';
import { startDataFetching } from './sources';
import { SofaScoreDataSource } from './sources/sofascore';
import puppeteer from 'puppeteer-core';

// Import chrome-paths the same way as BrowserPoolManager
const { chrome } = require('chrome-paths');

// Initialize environment variables from .env file
dotenv.config();

const main = async () => {
    console.log("🚀 Starting the application...");

    const port = parseInt(process.env.PORT || '8080', 10);
    const wss = initializeWebSocketServer(port);

    const useMockData = process.env.USE_MOCK_DATA === 'true';

    if (useMockData) {
        console.log("🟢 Running in MOCK DATA mode.");
        // Start the main data fetching loop for mock data
        startDataFetching(null);
        return;
    }

    // Check which APIs are configured
    const apiNames = (process.env.APIS_TO_FETCH || '').split(',').map(s => s.trim()).filter(Boolean);
    const needsSofaScore = apiNames.includes('sofascore');
    const needsCodere = apiNames.includes('codere');
    const needsLuckia = apiNames.includes('luckia');
    
    let sharedBrowser: any = null;

    // Create browser for Codere/Luckia if needed (they require a shared browser instance)
    if (needsCodere || needsLuckia) {
        console.log("🌐 Launching shared browser for Codere/Luckia...");
        try {
            sharedBrowser = await puppeteer.launch({
                executablePath: chrome,
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ]
            });
            console.log("✅ Shared browser launched successfully");
        } catch (error) {
            console.error("❌ Failed to launch shared browser:", error);
            console.log("⚠️ Codere/Luckia data sources will not work without browser");
        }
    }

    // Create SofaScore data source if needed (handles its own browser pool)
    if (needsSofaScore) {
        console.log("🚀 Starting SofaScore API data fetching...");
        const sofaScoreDataSource = new SofaScoreDataSource();
        // Start the SofaScore fetching loop (manages its own 60-second cycle with 3 browsers)
        sofaScoreDataSource.startFetching();
    }

    // Start the main data aggregation and WebSocket broadcasting loop (5-second interval)
    // Pass shared browser for Codere/Luckia, SofaScore will ignore it and use its own pool
    await startDataFetching(sharedBrowser);

    // Graceful shutdown
    process.on("SIGINT", async () => {
        console.log("\n🔌 Shutting down gracefully...");
        
        if (sharedBrowser) {
            try {
                await sharedBrowser.close();
                console.log("✅ Shared browser closed");
            } catch (error) {
                console.error("❌ Error closing shared browser:", error);
            }
        }
        
        console.log("Server shut down.");
        process.exit(0);
    });
};

main().catch(error => {
    console.error("💥 An unexpected error occurred:", error);
    process.exit(1);
});