// Types specific to the Luckia API response
export interface P {
    id: number;
    od: number;
    doi: number;
    tpn: string;
    v: boolean;
}

export interface Bo {
    bid: number;
    btn: string;
    v: boolean;
    p: P[];
}

export interface Live {
    id: number;
    sn: string;
    cn: string;
    catn: string;
    st: string;
    sdt: string;
    s: string; // FIX: Changed from number to string
    mt: string;
    t1n: string;
    t2n: string;
    t1s: string; // FIX: Changed from number to string
    t2s: string; // FIX: Changed from number to string
    t1ss: string[] | null;
    t2ss: string[] | null;
    a: boolean;
    ba: boolean;
    bo: Bo[] | null;
}

export interface RootObject {
    live: Live[];
}