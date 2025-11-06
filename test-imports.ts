import { Browser } from 'puppeteer';
import { broadcastToAllClients, broadcastSubscriptionUpdate, sendImmediateResponse, getWatchedMatches } from '../common/websocketServer';
import { CombinedData } from '../common/commonTypes';
import { IDataSource } from './IDataSource';
import { 
    getGameLiveByCategoryInfo, 
    getLeagues, 
    getLeagueEvents,
    subscribeToLeagues,
    unsubscribeFromLeagues,
    subscribeToLeagueEvents,
    unsubscribeFromLeagueEvents,
    subscribeToLeagueCategories,
    unsubscribeFromLeagueCategories,
    subscribeToLeagueEventsWithGames,
    unsubscribeFromLeagueEventsWithGames,
    subscribeToLeftMenu,
    unsubscribeFromLeftMenu,
    subscribeToMatchCategories,
    unsubscribeFromMatchCategories,
    subscribeToMatchGames,
    unsubscribeFromMatchGames,
    subscribeToLiveEventMarketCategories,
    unsubscribeFromLiveEventMarketCategories,
    subscribeToLiveEventsWithMarketCategory,
    unsubscribeFromLiveEventsWithMarketCategory
} from './codere';

// Test file to see if imports work
console.log('Imports test completed');