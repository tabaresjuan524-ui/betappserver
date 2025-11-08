/**
 * Progressive Update Handler for SofaScore
 * 
 * This module handles progressive data updates as sports are scraped incrementally.
 * Instead of waiting for all sports to complete, it broadcasts updates after each sport.
 */

import { CombinedData, StandardizedEvent, LiveEvent, Sport } from '../../common/commonTypes';
import { transformSofaScoreEvent } from './dataTransformer';
import { transformToRichFormat } from './richDataTransformer';

/**
 * Transform raw SofaScore partial data into CombinedData format with rich structure
 */
export function transformPartialData(sofascoreData: any): CombinedData {
    // Transform to rich format with nested sofascore structure
    const richData = transformToRichFormat(sofascoreData);
    
    // Transform for legacy compatibility
    const standardizedEvents: StandardizedEvent[] = Object.entries(sofascoreData.events || {})
        .map(([eventId, eventData]) => transformSofaScoreEvent(eventId, eventData))
        .filter((event): event is StandardizedEvent => event !== null);

    const sports: Sport[] = Object.values(sofascoreData.sports || {}).map((sport: any): Sport => ({
        key: sport.slug,
        group: 'sofascore',
        title: sport.name,
        description: `Live events from SofaScore for ${sport.name}`,
        active: true,
        has_outrights: false
    }));

    const liveEvents: LiveEvent[] = standardizedEvents.map((event: StandardizedEvent): LiveEvent => ({
        id: parseInt(event.eventId) || 0,
        api_name: 'sofascore',
        sport_group: event.sport,
        sport_category: event.sport,
        sport_title: event.eventName,
        league_logo: null,
        home_team: event.homeTeam.name,
        away_team: event.awayTeam.name,
        markets: [],
        commence_time: new Date().toISOString(),
        scores: {
            home: event.homeTeam.score,
            away: event.awayTeam.score
        },
        bookmakers: [],
        status: event.status,
        match_time: event.matchTime.toString(),
        start_time: new Date().toISOString(),
        active: true,
        bettingActive: true,
        team1_score: isNaN(parseInt(event.homeTeam.score)) ? 0 : parseInt(event.homeTeam.score),
        team2_score: isNaN(parseInt(event.awayTeam.score)) ? 0 : parseInt(event.awayTeam.score),
        marketsCount: 0,
        liveData: event
    }));

    const combinedData: CombinedData = {
        sports,
        liveEvents,
        standardizedEvents,
        sofascore: {
            liveData: richData,  // Rich nested structure
            events: sofascoreData.events || {},  // Raw events for backward compatibility
            sports: sofascoreData.sports || {},
            tournaments: sofascoreData.tournaments || {},
            teams: sofascoreData.teams || {},
            media: sofascoreData.media || {}
        }
    };
    
    return combinedData;
}

/**
 * Broadcast partial update to all connected clients
 */
export function broadcastPartialUpdate(combinedData: CombinedData): void {
    const { broadcastSubscriptionUpdate } = require('../../common/websocketServer');
    
    const eventCount = combinedData.standardizedEvents?.length || 0;
    const sportCount = combinedData.sports?.length || 0;
    const richEventCount = Object.keys(combinedData.sofascore?.liveData?.events || {}).length;
    
    console.log(`📤 [PROGRESSIVE UPDATE] Broadcasting partial data:`);
    console.log(`   - Sports: ${sportCount}`);
    console.log(`   - Standardized Events: ${eventCount}`);
    console.log(`   - Rich Events (sofascore.liveData): ${richEventCount}`);
    console.log(`   - Live Events: ${combinedData.liveEvents?.length || 0}`);
    
    broadcastSubscriptionUpdate('mainData', {
        type: 'mainData',
        data: combinedData
    });
}

/**
 * Create a progressive callback function for the SofaScore API
 * Returns a callback that transforms and broadcasts partial data
 */
export function createProgressiveCallback(updateCache: (data: CombinedData) => void): (partialData: any) => void {
    return (partialData: any) => {
        try {
            // Transform the partial data
            const transformedData = transformPartialData(partialData.sofascoreData || partialData);
            
            // Update the cache
            updateCache(transformedData);
            
            // Broadcast to clients
            broadcastPartialUpdate(transformedData);
            
        } catch (error) {
            console.error(`❌ [PROGRESSIVE CALLBACK] Error processing partial data:`, error);
        }
    };
}
