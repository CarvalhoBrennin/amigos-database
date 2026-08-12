import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { CatalogGame, CatalogGateway, CatalogGameSummary } from './catalog-gateway.js';

const structuralGameSchema = z.object({
    id: z.number().int().positive(),
    type: z.string().min(1),
    players: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    diff: z.string().min(1),
    rating: z.number().min(0).max(10),
    year: z.number().int(),
    catalogPrice: z.string().min(1),
    session: z.string().min(1),
    tags: z.array(z.string()),
    stats: z.tuple([
        z.number().min(0).max(10),
        z.number().min(0).max(10),
        z.number().min(0).max(10),
        z.number().min(0).max(10),
        z.number().min(0).max(10),
    ]),
    imgQ: z.string().min(1),
    imgUrl: z.string().url().nullable(),
    storeUrl: z.string().url().nullable(),
    youtubeUrl: z.string().url().nullable(),
});

const editorialGameSchema = z.object({
    title: z.string().min(1),
    desc: z.string(),
    mechanic: z.string(),
    verdict: z.string(),
});

function normalizeSearch(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .trim();
}

export class StaticJsonCatalogGateway implements CatalogGateway {
    private readonly gamesById: Map<string, CatalogGame>;

    private constructor(games: CatalogGame[]) {
        this.gamesById = new Map(games.map((game) => [game.id, game]));
    }

    static async create(repositoryRoot = process.cwd()): Promise<StaticJsonCatalogGateway> {
        const [structuralRaw, editorialRaw] = await Promise.all([
            readFile(path.join(repositoryRoot, 'src/content/catalog/games.structural.json'), 'utf8'),
            readFile(path.join(repositoryRoot, 'src/content/catalog/games.editorial.pt.json'), 'utf8'),
        ]);
        const structural = z.array(structuralGameSchema).parse(JSON.parse(structuralRaw));
        const editorial = z.record(z.string(), editorialGameSchema).parse(JSON.parse(editorialRaw));
        const games = structural.map((entry): CatalogGame => {
            const content = editorial[String(entry.id)];
            if (!content) {
                throw new Error(`Missing editorial content for catalog game ${entry.id}`);
            }

            return {
                id: String(entry.id),
                title: content.title,
                description: content.desc,
                mechanic: content.mechanic,
                verdict: content.verdict,
                type: entry.type,
                players: entry.players,
                difficulty: entry.diff,
                rating: entry.rating,
                year: entry.year,
                catalogPrice: entry.catalogPrice,
                session: entry.session,
                tags: entry.tags,
                stats: entry.stats,
                imageQuery: entry.imgQ,
                imageUrl: entry.imgUrl,
                storeUrl: entry.storeUrl,
                youtubeUrl: entry.youtubeUrl,
            };
        });

        return new StaticJsonCatalogGateway(games);
    }

    async getGameById(gameId: string): Promise<CatalogGame | null> {
        return this.gamesById.get(gameId) ?? null;
    }

    async searchGames(query: string, language = 'pt', limit = 10): Promise<CatalogGameSummary[]> {
        void language;
        const normalizedQuery = normalizeSearch(query);
        if (!normalizedQuery) {
            return [];
        }

        return [...this.gamesById.values()]
            .filter((game) => normalizeSearch(game.title).includes(normalizedQuery))
            .slice(0, Math.max(1, Math.min(limit, 20)))
            .map((game) => ({ id: game.id, title: game.title, imageUrl: game.imageUrl }));
    }

    async listGameIds(): Promise<string[]> {
        return [...this.gamesById.keys()];
    }

    async listGames(): Promise<CatalogGame[]> {
        return [...this.gamesById.values()];
    }
}
