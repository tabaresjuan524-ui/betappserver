/**
 * Rich Data Transformer for SofaScore
 * Transforms raw API data into a comprehensive structure for real-time display
 */

export interface SofaScoreLiveData {
    events: Record<string, SofaScoreRichEvent>;
    sports: Record<string, SofaScoreSport>;
    tournaments: Record<string, SofaScoreTournament>;
    teams: Record<string, SofaScoreTeam>;
    summary: {
        totalSports: number;
        totalEvents: number;
        lastUpdate: string;
    };
}

export interface SofaScoreRichEvent {
    id: string;
    sport: string;
    tournament: {
        id: number;
        name: string;
        category: string;
        country: string;
    } | null;
    homeTeam: {
        id: number;
        name: string;
        shortName: string;
        score: number;
        logo: string;
    };
    awayTeam: {
        id: number;
        name: string;
        shortName: string;
        score: number;
        logo: string;
    };
    status: {
        code: number;
        type: string; // 'inprogress' | 'finished' | 'notstarted'
        description: string; // '1st half', '2nd half', 'HT', 'FT'
    };
    time: {
        currentMinute: number;
        currentPeriod: string;
        injuryTime: number;
    } | null;
    liveData: {
        lastActions: LastAction[];
        statistics: EventStatistics | null;
        momentum: number | null; // -100 to 100, negative = away advantage
    };
    url: string;
    startTime: string;
}

export interface LastAction {
    type: string; // 'goal', 'yellowCard', 'substitution', 'period', etc.
    time: number;
    team: 'home' | 'away';
    player?: string;
    description: string;
}

export interface EventStatistics {
    ballPossession: { home: number; away: number };
    shots: { home: number; away: number };
    shotsOnTarget: { home: number; away: number };
    corners: { home: number; away: number };
    fouls: { home: number; away: number };
    yellowCards: { home: number; away: number };
    redCards: { home: number; away: number };
}

export interface SofaScoreSport {
    slug: string;
    name: string;
    liveEventCount: number;
}

export interface SofaScoreTournament {
    id: number;
    name: string;
    slug: string;
    category: string;
    country: string;
    logo: string;
}

export interface SofaScoreTeam {
    id: number;
    name: string;
    shortName: string;
    slug: string;
    logo: string;
    sport: string;
}

/**
 * Transform raw SofaScore data into rich format
 */
export function transformToRichFormat(rawData: any): SofaScoreLiveData {
    const richData: SofaScoreLiveData = {
        events: {},
        sports: {},
        tournaments: {},
        teams: {},
        summary: {
            totalSports: 0,
            totalEvents: 0,
            lastUpdate: new Date().toISOString()
        }
    };

    // Transform events
    if (rawData.events) {
        Object.entries(rawData.events).forEach(([eventId, eventData]: [string, any]) => {
            richData.events[eventId] = transformEvent(eventId, eventData);
        });
    }

    // Transform sports
    if (rawData.sports) {
        Object.entries(rawData.sports).forEach(([slug, sport]: [string, any]) => {
            richData.sports[slug] = {
                slug,
                name: sport.name || slug,
                liveEventCount: sport.liveCount || 0
            };
        });
    }

    // Transform tournaments
    if (rawData.tournaments) {
        Object.entries(rawData.tournaments).forEach(([id, tournament]: [string, any]) => {
            richData.tournaments[id] = {
                id: parseInt(id),
                name: tournament.name,
                slug: tournament.slug,
                category: tournament.category || '',
                country: tournament.country || '',
                logo: tournament.imageUrl || `https://img.sofascore.com/api/v1/unique-tournament/${id}/image`
            };
        });
    }

    // Transform teams
    if (rawData.teams) {
        Object.entries(rawData.teams).forEach(([id, team]: [string, any]) => {
            richData.teams[id] = {
                id: parseInt(id),
                name: team.name,
                shortName: team.shortName || team.name,
                slug: team.slug || '',
                logo: team.imageUrl || `https://img.sofascore.com/api/v1/team/${id}/image`,
                sport: team.sport || ''
            };
        });
    }

    richData.summary.totalSports = Object.keys(richData.sports).length;
    richData.summary.totalEvents = Object.keys(richData.events).length;

    return richData;
}

/**
 * Transform a single event into rich format
 */
function transformEvent(eventId: string, eventData: any): SofaScoreRichEvent {
    const apiData = eventData.apiData || {};
    const eventDetails = apiData.eventDetails?.event;
    
    // Extract home/away scores
    const homeScore = eventDetails?.homeScore?.current || eventDetails?.homeScore?.display || 0;
    const awayScore = eventDetails?.awayScore?.current || eventDetails?.awayScore?.display || 0;

    // Extract team info
    const homeTeam = eventDetails?.homeTeam || {};
    const awayTeam = eventDetails?.awayTeam || {};

    // Extract status
    const status = eventDetails?.status || { code: 0, type: 'notstarted', description: 'Not started' };

    // Extract time info
    let timeInfo = null;
    if (status.type === 'inprogress' && eventDetails?.time) {
        const currentSeconds = eventDetails.time.initial || 0;
        const currentMinute = Math.floor(currentSeconds / 60);
        const injuryTime = eventDetails.time.extra ? Math.floor(eventDetails.time.extra / 60) : 0;
        
        timeInfo = {
            currentMinute,
            currentPeriod: eventDetails.lastPeriod || 'period1',
            injuryTime
        };
    }

    // Extract last actions from incidents
    const lastActions = extractLastActions(apiData.incidents);

    // Extract statistics
    const statistics = extractStatistics(apiData.statistics);

    // Calculate momentum (based on recent actions and possession)
    const momentum = calculateMomentum(statistics, lastActions);

    return {
        id: eventId,
        sport: eventData.sport || 'unknown',
        tournament: eventDetails?.tournament ? {
            id: eventDetails.tournament.uniqueTournament?.id || 0,
            name: eventDetails.tournament.name || '',
            category: eventDetails.tournament.category?.name || '',
            country: eventDetails.tournament.category?.country?.name || ''
        } : null,
        homeTeam: {
            id: homeTeam.id || 0,
            name: homeTeam.name || 'Home',
            shortName: homeTeam.shortName || homeTeam.name || 'Home',
            score: homeScore,
            logo: `https://img.sofascore.com/api/v1/team/${homeTeam.id}/image`
        },
        awayTeam: {
            id: awayTeam.id || 0,
            name: awayTeam.name || 'Away',
            shortName: awayTeam.shortName || awayTeam.name || 'Away',
            score: awayScore,
            logo: `https://img.sofascore.com/api/v1/team/${awayTeam.id}/image`
        },
        status: {
            code: status.code,
            type: status.type,
            description: status.description || ''
        },
        time: timeInfo,
        liveData: {
            lastActions,
            statistics,
            momentum
        },
        url: eventData.url || `https://www.sofascore.com/event/${eventId}`,
        startTime: eventDetails?.startTimestamp ? new Date(eventDetails.startTimestamp * 1000).toISOString() : new Date().toISOString()
    };
}

/**
 * Extract last 5 significant actions from incidents
 */
function extractLastActions(incidents: any): LastAction[] {
    if (!incidents || !incidents.incidents) return [];

    const significantTypes = ['goal', 'yellowCard', 'redCard', 'substitution', 'period', 'injuryTime'];
    
    return incidents.incidents
        .filter((incident: any) => significantTypes.includes(incident.incidentType))
        .slice(0, 5)
        .map((incident: any) => ({
            type: incident.incidentType,
            time: incident.time || 0,
            team: incident.isHome ? 'home' : 'away',
            player: incident.player?.name || incident.playerIn?.name || undefined,
            description: formatIncidentDescription(incident)
        }));
}

/**
 * Format incident description
 */
function formatIncidentDescription(incident: any): string {
    switch (incident.incidentType) {
        case 'goal':
            return `⚽ Goal by ${incident.player?.shortName || 'Unknown'}`;
        case 'yellowCard':
            return `🟨 Yellow card for ${incident.player?.shortName || 'Unknown'}`;
        case 'redCard':
            return `🟥 Red card for ${incident.player?.shortName || 'Unknown'}`;
        case 'substitution':
            return `🔄 ${incident.playerIn?.shortName} ↔ ${incident.playerOut?.shortName}`;
        case 'period':
            return incident.text || 'Period';
        default:
            return incident.text || incident.incidentType;
    }
}

/**
 * Extract statistics from raw data
 */
function extractStatistics(statistics: any): EventStatistics | null {
    if (!statistics || !statistics.statistics) return null;

    const allPeriod = statistics.statistics.find((s: any) => s.period === 'ALL');
    if (!allPeriod) return null;

    const stats: any = {};
    
    allPeriod.groups?.forEach((group: any) => {
        group.statisticsItems?.forEach((item: any) => {
            stats[item.key] = {
                home: item.homeValue || 0,
                away: item.awayValue || 0
            };
        });
    });

    return {
        ballPossession: stats.ballPossession || { home: 50, away: 50 },
        shots: stats.totalShots || { home: 0, away: 0 },
        shotsOnTarget: stats.shotsOnTarget || { home: 0, away: 0 },
        corners: stats.cornerKicks || { home: 0, away: 0 },
        fouls: stats.fouls || { home: 0, away: 0 },
        yellowCards: stats.yellowCards || { home: 0, away: 0 },
        redCards: stats.redCards || { home: 0, away: 0 }
    };
}

/**
 * Calculate momentum indicator (-100 to 100)
 */
function calculateMomentum(statistics: EventStatistics | null, lastActions: LastAction[]): number {
    if (!statistics) return 0;

    // Weight factors
    let momentum = 0;

    // Possession advantage (max ±30)
    const possessionDiff = statistics.ballPossession.home - statistics.ballPossession.away;
    momentum += (possessionDiff / 100) * 30;

    // Shot advantage (max ±20)
    const shotDiff = statistics.shots.home - statistics.shots.away;
    momentum += Math.max(-20, Math.min(20, shotDiff * 2));

    // Recent goals (max ±30)
    const recentGoals = lastActions
        .filter(action => action.type === 'goal')
        .slice(0, 3);
    
    recentGoals.forEach((goal, index) => {
        const weight = 3 - index; // Recent goals weight more
        momentum += goal.team === 'home' ? (10 * weight) : (-10 * weight);
    });

    // Red cards (±20 each)
    const redCardDiff = (statistics.redCards.away - statistics.redCards.home) * 20;
    momentum += redCardDiff;

    return Math.max(-100, Math.min(100, Math.round(momentum)));
}
