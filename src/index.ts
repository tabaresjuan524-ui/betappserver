import * as dotenv from 'dotenv';
import { initializeWebSocketServer } from './common/websocketServer';
import { startDataFetching } from './sources';
import { SofaScoreDataSource } from './sources/sofascore';

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

    console.log("🚀 Starting SofaScore API data fetching...");

    // Create SofaScore data source (no browser needed, handles its own)
    const sofaScoreDataSource = new SofaScoreDataSource();

    // Start the SofaScore fetching loop (manages its own 60-second cycle)
    sofaScoreDataSource.startFetching();

    // Start the main data aggregation and WebSocket broadcasting loop (5-second interval)
    // This will call sofaScoreDataSource.fetchData() which returns cached data
    await startDataFetching(null);

    // Graceful shutdown
    process.on("SIGINT", async () => {
        console.log("\n🔌 Shutting down gracefully...");
        console.log("Server shut down.");
        process.exit(0);
    });
};

main().catch(error => {
    console.error("💥 An unexpected error occurred:", error);
    process.exit(1);
});