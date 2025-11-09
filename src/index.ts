import * as dotenv from 'dotenv';
import { initializeWebSocketServer } from './common/websocketServer';
import { startDataFetching } from './sources';
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Cluster } from 'puppeteer-cluster';
import { SofaScoreDataSource } from './sources/sofascore';

// Initialize environment variables from .env file
dotenv.config();

// Apply the stealth plugin to make Puppeteer less detectable
puppeteer.use(StealthPlugin());

const main = async () => {
    console.log("🚀 Starting the application...");

    const port = parseInt(process.env.PORT || '8080', 10);
    const wss = initializeWebSocketServer(port);

    const useMockData = process.env.USE_MOCK_DATA === 'true';

    if (useMockData) {
        console.log("🟢 Running in MOCK DATA mode, browser will not be launched.");
        // Start the main data fetching loop for mock data
        startDataFetching(null);
        return;
    }

    console.log("🚀 Initializing Puppeteer Cluster...");

    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: 10, // Start with 10, can be increased
        puppeteer: puppeteer as any, // Use the puppeteer-extra instance
        puppeteerOptions: {
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                '--disable-extensions'
            ],
            protocolTimeout: 600000, // 10 minutes
        },
        timeout: 5 * 60 * 1000, // 5 minute timeout for each task
        retryLimit: 2, // Retry failed tasks 2 times
        retryDelay: 5000, // 5 seconds delay between retries
        skipDuplicateUrls: false, // Allow processing the same URL multiple times
    });

    // Create a single data source instance to be shared across all tasks
    const sofaScoreDataSource = new SofaScoreDataSource(cluster);

    // Start the main data fetching loop, now managed by the data source
    sofaScoreDataSource.startFetching();

    // Graceful shutdown
    process.on("SIGINT", async () => {
        console.log("\n🔌 Shutting down gracefully...");
        await cluster.idle();
        await cluster.close();
        console.log("Cluster and server shut down.");
        process.exit(0);
    });
};

main().catch(error => {
    console.error("💥 An unexpected error occurred:", error);
    process.exit(1);
});