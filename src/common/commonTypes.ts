import { CodereLeftMenuData } from "../sources/codere/types";
export interface Root {
    live: Live[]
}

export interface Live {
    id: number | null
    vsid?: string | null
    vspc?: string | null
    sdt: string | null
    st: string | null
    sdy: number | null
    c: any | null
    ia: boolean | null
    ba: boolean | null
    a: boolean | null
    s: string | null
    t1s: string | null
    t2s: string | null
    t1ss: string[] | null
    t2ss: string[] | null
    t1gs: any | null
    t2gs: any | null
    mt: string | null
    ld: boolean | null
    srv: string | null
    hp: boolean | null
    di: number | null
    catid: number | null
    catn: string | null
    sid: number | null
    so: number | null
    sn: string | null
    cid: number | null
    cn: string | null
    co: number | null
    cii?: number | null
    cc: any | null
    t1n: string | null
    t2n: string | null
    boc: number | null
    bo: Bo[] | null
    crd: any[] | null
    eca: boolean | null
}

export interface Bo {
    btid: string | null
    bt: string | null
    btn: string | null
    btsn: string | null
    b: boolean | null
    v: boolean | null
    ca: boolean | null
    bid: number | null
    c: string | null
    vu: string | null
    sbv?: string | null
    mb: boolean | null
    ibo: boolean | null
    o: number | null
    ifm: boolean | null
    vt: number | null
    fpc: boolean | null
    btca: boolean | null
    bogt: string | null
    p: P[] | null
}

export interface P {
    tpn: string | null
    up: string | null
    btp: string | null
    od: number | null
    o: number | null
}

export interface SportStat {
    sportId: number;
    sportName: string;
    count: number;
}


export interface CombinedData {
    sports: Sport[];
    liveEvents: LiveEvent[];
    standardizedEvents?: StandardizedEvent[];
    codere?: {
        leftMenu?: CodereLeftMenuData;
    };
    sofascore?: any;
}

export interface Sport {
    key: string;
    group: string;
    title: string;
    description: string;
    active: boolean;
    has_outrights: boolean;
}
export interface Outcome {
    name: string;
    price: number;
    point: string;
    suspended: boolean;
    oddChange: number;
}

export interface Market {
    name: string;
    key: string | number;
    outcomes: Outcome[];
}
export interface LiveEvent {
    id: number | null;
    api_name: string;
    sport_group: string | null;
    sport_category: string;
    sport_title: string | null; // Nombre de la Liga
    league_logo?: string | null; // URL of the league logo
    home_team: string | null;
    away_team: string | null;
    markets: Market[];
    commence_time: string | null;
    scores?: {
        home: string | null; away: string | null;
        additionalScores?: {
            home: string[] | null;
            away: string[] | null;
        };
    };
    bookmakers: any[] | null;
    status: string | null; // ej., 'live', 'not_started'
    match_time: string | null; // e.g., "2nd Half", "Set 3"
    start_time: string | null;
    active: boolean | null;
    bettingActive: boolean | null;
    team1_score : number;
    team2_score : number;
    marketsCount?: number; // Number of available markets for this event
    liveData?: any; // Raw live data from the source API for sport-specific statistics

}

export interface SofaSport {
    id: number;
    name: string;
    slug: string;
}

export interface StandardizedEvent {
    eventId: number;
    source: 'sofascore' | 'codere' | 'luckia';
    sport: string;
    eventName: string;
    homeTeam: { name: string; score: string; };
    awayTeam: { name: string; score: string; };
    matchTime: string | number;
    status: string;
    stats?: StandardizedStatsGroup[];
    incidents?: StandardizedIncident[];
}

export interface StandardizedStatsGroup {
    groupName: string;
    statistics: {
        name: string;
        home: string | number;
        away: string | number;
    }[];
}

export interface StandardizedIncident {
    type: 'goal' | 'card' | 'substitution' | 'period';
    time: number;
    player?: string;
    team?: 'home' | 'away';
    description: string;
}