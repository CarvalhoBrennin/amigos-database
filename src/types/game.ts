export type GameTypeId =
    | 'coop_campaign'
    | 'survival'
    | 'roguelike'
    | 'puzzle'
    | 'tactical_action'
    | 'simulation'
    | 'party';

export type GameTypeFilter = GameTypeId | 'all';

export type SupportedGameLocale = 'pt';

export type Difficulty = 'Fácil' | 'Moderada' | 'Difícil' | 'Brutal';

export interface GameCatalogBase {
    id: number;
    type: GameTypeId;
    players: [number, number];
    diff: Difficulty;
    rating: number;
    year: number;
    catalogPrice: string;
    session: string;
    tags: string[];
    stats: [number, number, number, number, number]; // [Comms, Skill, Chaos, Strategy, Story]
    imgQ: string;
    imgUrl?: string;
    storeUrl?: string;
    youtubeUrl?: string;
}

export interface GameEditorialContent {
    title: string;
    desc: string;
    mechanic: string;
    verdict: string;
}

export interface Game extends GameCatalogBase, GameEditorialContent {
    price: string;
}

export interface GameStats {
    dimension: string;
    value: number;
    fullMark: number;
}

export type SortOption = 'rating' | 'title' | 'year' | 'players';

export interface FilterState {
    type: GameTypeFilter;
    search: string;
    sort: SortOption;
    playerMin: number;
}
