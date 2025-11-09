import { StandardizedEvent, StandardizedStatsGroup, StandardizedIncident } from '../../common/commonTypes';

/**
 * Transforms the raw, aggregated SofaScore API data for a single event 
 * into a standardized format for frontend consumption.
 *
 * @param eventId - The unique identifier for the event.
 * @param rawEventData - The collection of raw API responses for this event.
 * @returns A standardized event object or null if essential data is missing.
 */
export function transformSofaScoreEvent(eventId: string, rawEventData: any): StandardizedEvent | null {
    // Try both new enhanced structure and legacy structure
    const details = rawEventData.apiData?.['event-details']?.event || rawEventData.apiData?.eventDetails?.event;
    if (!details) {
        console.warn(`[TRANSFORMER] No event details found for event ${eventId}`);
        return null; // Cannot process without basic event details
    }

    const homeTeam = details.homeTeam;
    const awayTeam = details.awayTeam;
    const score = details.homeScore?.current ?? 0;
    const awayScore = details.awayScore?.current ?? 0;

    const standardizedEvent: StandardizedEvent = {
        eventId: eventId,
        source: 'sofascore',
        sport: rawEventData.sport,
        eventName: details.name || `${homeTeam?.name} vs ${awayTeam?.name}`,
        homeTeam: {
            name: homeTeam?.name || 'Unknown',
            score: score.toString(),
        },
        awayTeam: {
            name: awayTeam?.name || 'Unknown',
            score: awayScore.toString(),
        },
        matchTime: details.time?.currentPeriodStartTimestamp ? 
                   Math.floor((Date.now() / 1000 - details.time.currentPeriodStartTimestamp) / 60) : 
                   (details.status?.description || 'Unknown'),
        status: details.status?.description || 'Unknown',
        stats: transformStatistics(rawEventData.apiData?.statistics),
        incidents: transformIncidents(rawEventData.apiData?.incidents?.incidents || rawEventData.apiData?.incidents),
        // Add enhanced data for live statistics widgets
        liveData: rawEventData.liveData,
        teams: rawEventData.teams,
        tournament: rawEventData.tournament,
        media: rawEventData.media,
        // Raw API data for advanced use cases
        rawApiData: rawEventData.apiData
    };

    return standardizedEvent;
}

/**
 * Transforms the raw statistics object from SofaScore into a standardized array.
 * @param rawStats - The 'statistics' object from the SofaScore API.
 * @returns A standardized array of stat groups, or undefined if no stats are available.
 */
function transformStatistics(rawStats: any): StandardizedStatsGroup[] | undefined {
    if (!rawStats || !rawStats.statistics) {
        return undefined;
    }

    return rawStats.statistics.map((group: any) => ({
        groupName: group.period,
        statistics: group.groups.flatMap((subGroup: any) =>
            subGroup.statisticsItems.map((item: any) => ({
                name: item.name,
                home: item.home,
                away: item.away,
            }))
        ),
    }));
}

/**
 * Transforms the raw incidents array from SofaScore into a standardized format.
 * @param rawIncidents - The 'incidents' array from the SofaScore API.
 * @returns A standardized array of incidents, or undefined if none are available.
 */
function transformIncidents(rawIncidents: any[]): StandardizedIncident[] | undefined {
    if (!rawIncidents) {
        return undefined;
    }

    return rawIncidents.map((incident: any): StandardizedIncident => {
        let type: StandardizedIncident['type'] = 'period';
        if (incident.incidentType === 'goal') type = 'goal';
        if (incident.incidentType === 'card') type = 'card';

        return {
            type: type,
            time: incident.time,
            player: incident.player?.name,
            team: incident.isHome ? 'home' : 'away',
            description: incident.text || `${incident.incidentClass} - ${incident.time}'`,
        };
    });
}
