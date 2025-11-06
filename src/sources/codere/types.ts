// Types specific to the Codere GetHomeLiveEvents API response

export interface CodereRoot {
    LiveSport: LiveSport[];
    LiveEventsCount: number;
}

export interface LiveSport {
    Events: Event[];
    SportOrder: number;
    SportId: string;
    Name: string;
    NodeId: string;
    ParentNodeId: string;
    Priority: number;
    SportHandle: string;
    Locked: boolean;
}

export interface Event {
    ResultInfo: string;
    DefaultGame: null;
    liveData: LiveData;
    StartDate: string;
    StarDate: string;
    isLive: boolean;
    LeagueName: string;
    ChildrenCount: number;
    SportName: string;
    CountryCode: string;
    CountryName: string;
    Participants: Participant[];
    LiveHistory: null;
    SmartMarketReferenceGameTypeIds: string;
    StatisticsId: string;
    SportId: string;
    Games: Game[];
    StreamingId: null;
    StreamingEnabled: null;
    LTMEnabled: boolean;
    LeagueKlothoPriority: number;
    HighlightPriority: number;
    ParticipantHome: string;
    ParticipantAway: string;
    ParticipantHomeId: number;
    ParticipantAwayId: number;
    Name: string;
    NodeId: string;
    ParentNodeId: string;
    Priority: number;
    SportHandle: string;
    Locked: boolean;
}

export interface Game {
    Results: Result[];
    DisplayTypeName: string;
    CategoryInfo: CategoryInfo;
    CategoryInfos: CategoryInfo[];
    GameType: number;
    SmartMarketAvailable: boolean;
    Spov: string;
    ShortName: string;
    IsLive: null;
    Name: string;
    NodeId: string;
    ParentNodeId: string;
    Priority: number;
    SportHandle: string;
    Locked: boolean;
}

export interface CategoryInfo {
    CategoryId: string;
    CategoryName: string;
    IsRelevant: boolean;
}

export interface Result {
    Odd: number;
    SortOrder: number;
    IsLive: boolean;
    upOdd: boolean;
    downOdd: boolean;
    IsNonRunner: boolean;
    SportId: string;
    LocationId: string;
    LeagueId: string;
    EventId: string;
    EventHasHandicap: boolean;
    GameId: string;
    GameTypeId: number;
    GameSpecialOddsValue: string;
    GameBetTypeAvailability: number;
    GameNumberOfStarters: number;
    Name: string;
    NodeId: string;
    ParentNodeId: string;
    Priority: number;
    SportHandle: string;
    Locked: boolean;
}

export interface LiveData {
    Innings?: Array<number[]>; // For Baseball
    Sets?: Array<number[]>; // For Table Tennis, Tennis, etc.
    HomeService?: boolean;
    Strikes?: string;
    Balls?: string;
    Outs?: string;
    Bases?: Bases;
    Period: number;
    PeriodName: string;
    Actions: Action[];
    ResultHome: number;
    ResultAway: number;
    Time: string;
    MatchTime: number;
    RemainingPeriodTime: string;
    ParticipantHome: string;
    ParticipantAway: string;
}

export interface Action {
    Period: number;
    PeriodName: string;
    Time: number;
    ActionType: number;
    ActionTypeName: string;
    Participant: string;
    AffectedParticipant: string;
    IsHomeTeam: boolean;
}

export interface Bases {
    Baseone: boolean;
    Basetwo: boolean;
    Basethree: boolean;
}

export interface Participant {
    AdditionalValues: AdditionalValues;
    Id: number;
    IsHome: boolean;
    LocalizedNames: Localized;
    LocalizedShortNames: Localized;
}

export interface AdditionalValues {
    KeyValues: any[];
    LocalizedValues: LocalizedValue[];
    ReferenceId: number;
}

export interface LocalizedValue {
    Key: string;
    Value: string;
}

export interface Localized {
    LocalizedValues: LocalizedValueDetail[];
    ReferenceId: number;
}

export interface LocalizedValueDetail {
    CountryCode: string;
    LanguageCode: string;
    Value: string;
}

// Types specific to the Codere left menu data

export interface CodereLeftMenuData {
    sports:         CodereLeftMenuSport[];
    highlights:     CodereLeftMenuHighlight[];
    highlightsConfig: CodereLeftMenuHighlightsConfig[];
}

export interface CodereLeftMenuHighlightsConfig {
    LeagueName:  string;
    IconUrl:     string;
    IdLeagues:   string;
    SportName:   string;
    SportHandle: string;
    CountryCode: string;
}

export interface CodereLeftMenuHighlight {
    CountryCode:  null;
    SportsHandle: string;
    Name:         string;
    NodeId:       string;
    ParentNodeId: string;
    Priority:     number;
    SportHandle:  string;
    Locked:       boolean;
}

export interface CodereLeftMenuSport {
    Name:         string;
    NodeId:       string;
    ParentNodeId: string;
    Priority:     number;
    SportHandle:  string;
    Locked:       boolean;
    Submenu?:     CodereSubmenu;
}

// Types specific to the Codere submenu data

export interface CodereSubmenu {
    countries:  Country[];
    highlights: SubmenuHighlight[];
}

export interface Country {
    Leagues:      League[];
    CountryCode:  string;
    Name:         string;
    NodeId:       string;
    ParentNodeId: string;
    Priority:     number;
    SportHandle:  string;
    Locked:       boolean;
}

import { LiveEvent } from "../../common/commonTypes";

export interface League {
    Events:         LiveEvent[];
    KlothoPriority: number;
    Name:           string;
    NodeId:         string;
    ParentNodeId:   string;
    Priority:       number;
    SportHandle:    string;
    Locked:         boolean;
}

export interface SubmenuHighlight {
    CountryCode:  string;
    SportsHandle: string;
    Name:         string;
    NodeId:       string;
    ParentNodeId: string;
    Priority:     number;
    SportHandle:  string;
    Locked:       boolean;
}

// Types for the new GetLiveEventsAndSportsBySportHandle API response

export interface NewCodereDefaultGame {
    Results: Result[];
    DisplayTypeName: string;
    CategoryInfo: CategoryInfo;
    CategoryInfos: CategoryInfo[];
    GameType: number;
    SmartMarketAvailable: boolean;
    Spov: string;
    ShortName: string;
    IsLive: null | boolean;
    Name: string;
    NodeId: string;
    ParentNodeId: string;
    Priority: number;
    SportHandle: string;
    Locked: boolean;
}

// Extended Event type for new API format
export interface NewCodereEvent extends Omit<Event, 'DefaultGame'> {
    DefaultGame: NewCodereDefaultGame | null;
}

// Types for the Codere categories API response

export interface CodereCategory {
    CategoryId: string;
    CategoryName: string;
    CategoryShortName?: string;
    IsRelevant: boolean;
    Priority?: number;
}

export type CodereCategories = CodereCategory[];
