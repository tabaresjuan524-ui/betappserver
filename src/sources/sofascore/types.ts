export interface Sport {
    name: string;
    slug: string;
    id: number;
}

export interface SportEvent {
    id: number;
    name: string;
    slug: string;
    startTimestamp: number;
    homeTeam: { id: number; name: string; };
    awayTeam: { id: number; name: string; };
    homeScore: { current?: number; period1?: number; period2?: number; period3?: number; period4?: number; };
    awayScore: { current?: number; period1?: number; period2?: number; period3?: number; period4?: number; };
    status: { type: string; };
    time?: { currentPeriodStartTimestamp?: number; };
    tournament?: {
        id?: number;
        name: string;
        uniqueTournament?: {
            id: number;
            name: string;
        };
        category?: {
            name: string;
            sport?: {
                name: string;
            }
        }
    };
}

export interface EventDetails {
    id: number;
    name: string;
    startTimestamp: number;
    homeTeam: {
        id: number;
        name: string;
    };
    awayTeam: {
        id: number;
        name: string;
    };
    homeScore: {
        current: number;
    };
    awayScore: {
        current: number;
    };
    tournament: {
        id: number;
        name: string;
        uniqueTournament: {
            id: number;
        };
        category: {
            sport: {
                name: string;
            }
        }
    };
    // Add other properties from the event details response
}
