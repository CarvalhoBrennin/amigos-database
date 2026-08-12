export interface CatalogGame {
    id: string;
    title: string;
    description: string;
    mechanic: string;
    verdict: string;
    type: string;
    players: [number, number];
    difficulty: string;
    rating: number;
    year: number;
    catalogPrice: string;
    session: string;
    tags: string[];
    stats: [number, number, number, number, number];
    imageQuery: string;
    imageUrl: string | null;
    storeUrl: string | null;
    youtubeUrl: string | null;
}

export interface CatalogGameSummary {
    id: string;
    title: string;
    imageUrl: string | null;
}

export interface CatalogGateway {
    getGameById(gameId: string, language?: string): Promise<CatalogGame | null>;
    searchGames(query: string, language?: string, limit?: number): Promise<CatalogGameSummary[]>;
    listGameIds(): Promise<string[]>;
    listGames(): Promise<CatalogGame[]>;
}
