import { LiveEvent, Market, Outcome } from '../../common/commonTypes';

/**
 * Converts fractional odds to decimal odds
 * @param fractionalValue - String like "5/7" or "20/23"
 * @returns Decimal odds like 1.71
 */
function fractionalToDecimal(fractionalValue: string): number {
    if (!fractionalValue) return 1.0;
    
    const parts = fractionalValue.split('/');
    if (parts.length !== 2) return 1.0;
    
    const numerator = parseFloat(parts[0]);
    const denominator = parseFloat(parts[1]);
    
    if (isNaN(numerator) || isNaN(denominator) || denominator === 0) return 1.0;
    
    return parseFloat((1 + numerator / denominator).toFixed(2));
}

/**
 * Transforms SofaScore data to LiveEvents format (similar to Codere/Luckia)
 * @param sofascoreData - Raw SofaScore data from API
 * @returns Array of LiveEvent objects
 */
export function transformSofascoreToLiveEvents(sofascoreData: any): LiveEvent[] {
    if (!sofascoreData || !sofascoreData.sports) {
        return [];
    }

    const liveEvents: LiveEvent[] = [];

    // Iterate through each sport
    Object.entries(sofascoreData.sports).forEach(([sportName, sportData]: [string, any]) => {
        const liveEventsArray = sportData.liveEvents?.events || [];

        liveEventsArray.forEach((event: any) => {
            try {
                const eventId = event.id?.toString();
                if (!eventId) return;

                // Get detailed event data from intercepted endpoints
                const detailedEventData = sportData.events?.[eventId] || {};
                const eventDetails = detailedEventData[`event/${eventId}`]?.event || event;
                const oddsData = detailedEventData[`event/${eventId}/odds/1/featured`];
                const allOddsData = detailedEventData[`event/${eventId}/odds/1/all`];

                // Extract teams
                const homeTeam = eventDetails.homeTeam?.name || event.homeTeam?.name || 'Home Team';
                const awayTeam = eventDetails.awayTeam?.name || event.awayTeam?.name || 'Away Team';

                // Extract scores
                const homeScore = event.homeScore?.display || event.homeScore?.current || 0;
                const awayScore = event.awayScore?.display || event.awayScore?.current || 0;

                // Extract status and match time
                const status = event.status?.description || event.status?.type || 'live';
                const matchTime = event.time?.currentPeriodStartTimestamp 
                    ? `${Math.floor((Date.now() - event.time.currentPeriodStartTimestamp * 1000) / 60000)}'`
                    : status;

                // Extract tournament/league info
                const tournament = eventDetails.tournament || event.tournament;
                const leagueName = tournament?.name || tournament?.uniqueTournament?.name || 'Unknown League';
                const countryName = tournament?.category?.name || 'International';

                // Extract markets from odds data
                const markets: Market[] = [];

                // Add featured odds if available
                if (oddsData?.featured) {
                    const defaultOdds = oddsData.featured.default;
                    if (defaultOdds) {
                        const outcomes: Outcome[] = [];

                        // Handle different market types
                        if (defaultOdds.marketName === 'Full time' || defaultOdds.marketName === 'Match winner') {
                            // Match result market (1X2 or 12)
                            defaultOdds.choices?.forEach((choice: any) => {
                                outcomes.push({
                                    name: choice.name, // "1", "2", "X", "Home", "Away"
                                    price: fractionalToDecimal(choice.fractionalValue),
                                    point: '',
                                    suspended: defaultOdds.suspended || false,
                                    oddChange: choice.change || 0
                                });
                            });
                        } else if (defaultOdds.marketName === 'Match goals' || defaultOdds.marketName?.includes('Total')) {
                            // Over/Under market
                            defaultOdds.choices?.forEach((choice: any) => {
                                outcomes.push({
                                    name: choice.name, // "Over", "Under"
                                    price: fractionalToDecimal(choice.fractionalValue),
                                    point: defaultOdds.choiceGroup || '', // "6.5", "2.5", etc.
                                    suspended: defaultOdds.suspended || false,
                                    oddChange: choice.change || 0
                                });
                            });
                        }

                        if (outcomes.length > 0) {
                            markets.push({
                                name: defaultOdds.marketName,
                                key: defaultOdds.marketId || `market-${defaultOdds.fid}`,
                                outcomes: outcomes
                            });
                        }
                    }
                }

                // Add all other markets if available
                if (allOddsData?.markets && Array.isArray(allOddsData.markets)) {
                    allOddsData.markets.slice(0, 5).forEach((market: any) => {
                        // Skip if already added from featured
                        if (markets.some(m => m.key === market.id || m.name === market.marketName)) {
                            return;
                        }

                        const outcomes: Outcome[] = [];
                        market.choices?.forEach((choice: any) => {
                            outcomes.push({
                                name: choice.name,
                                price: fractionalToDecimal(choice.fractionalValue),
                                point: market.choiceGroup || '',
                                suspended: market.suspended || false,
                                oddChange: choice.change || 0
                            });
                        });

                        if (outcomes.length > 0) {
                            markets.push({
                                name: market.marketName,
                                key: market.id || `market-${market.fid}`,
                                outcomes: outcomes
                            });
                        }
                    });
                }

                // Create LiveEvent object
                const liveEvent: LiveEvent = {
                    id: parseInt(eventId, 10),
                    api_name: 'sofascore',
                    sport_group: sportName.charAt(0).toUpperCase() + sportName.slice(1).replace(/-/g, ' '),
                    sport_category: countryName,
                    sport_title: leagueName,
                    league_logo: null, // SofaScore doesn't provide direct logo URLs in this data
                    home_team: homeTeam,
                    away_team: awayTeam,
                    markets: markets,
                    commence_time: event.startTimestamp ? new Date(event.startTimestamp * 1000).toISOString() : null,
                    scores: {
                        home: homeScore.toString(),
                        away: awayScore.toString(),
                        additionalScores: {
                            home: [],
                            away: []
                        }
                    },
                    bookmakers: [],
                    status: status,
                    match_time: matchTime,
                    start_time: event.startTimestamp ? new Date(event.startTimestamp * 1000).toISOString() : null,
                    active: event.status?.type === 'inprogress',
                    bettingActive: markets.length > 0 && !markets.every(m => m.outcomes.every(o => o.suspended)),
                    team1_score: typeof homeScore === 'number' ? homeScore : parseInt(homeScore, 10) || 0,
                    team2_score: typeof awayScore === 'number' ? awayScore : parseInt(awayScore, 10) || 0,
                    marketsCount: markets.length,
                    liveData: {
                        incidents: detailedEventData[`event/${eventId}/incidents`]?.incidents || [],
                        statistics: detailedEventData[`event/${eventId}/statistics`] || null,
                        h2h: detailedEventData[`event/${eventId}/h2h`] || null,
                        rawEvent: event
                    }
                };

                liveEvents.push(liveEvent);
            } catch (error: any) {
                console.error(`❌ [SOFASCORE TRANSFORMER] Error transforming event ${event.id}:`, error.message);
            }
        });
    });

    console.log(`✅ [SOFASCORE TRANSFORMER] Transformed ${liveEvents.length} events to LiveEvents format`);
    return liveEvents;
}
