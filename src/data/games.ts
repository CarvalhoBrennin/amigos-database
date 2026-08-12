import { z } from 'zod';
import gamesEditorialPtJson from '@/content/catalog/games.editorial.pt.json';
import gamesStructuralJson from '@/content/catalog/games.structural.json';
import type {
    Difficulty,
    Game,
    GameEditorialContent,
    GameTypeFilter,
    GameTypeId,
    SupportedGameLocale,
} from '@/types/game';

export const gameTypeIds = [
    'coop_campaign',
    'survival',
    'roguelike',
    'puzzle',
    'tactical_action',
    'simulation',
    'party',
] as const satisfies readonly GameTypeId[];

export const gameTypeFilters = ['all', ...gameTypeIds] as const satisfies readonly GameTypeFilter[];

export const statLabels = [
    'stats.communication',
    'stats.skill',
    'stats.chaos',
    'stats.strategy',
    'stats.story',
] as const;

const editorialLocales = ['pt'] as const satisfies readonly SupportedGameLocale[];
const fallbackEditorialLocale: SupportedGameLocale = 'pt';

const difficultyValues = ['Fácil', 'Moderada', 'Difícil', 'Brutal'] as const satisfies readonly Difficulty[];

const gameCatalogSchema = z.object({
    id: z.number().int().positive(),
    type: z.enum(gameTypeIds),
    players: z
        .tuple([z.number().int().positive(), z.number().int().positive()])
        .refine(([min, max]) => min <= max, 'O mínimo de jogadores deve ser menor ou igual ao máximo'),
    diff: z.enum(difficultyValues),
    rating: z.number().min(0).max(10),
    year: z.number().int().min(1970).max(2100),
    catalogPrice: z.string().min(1),
    session: z.string().min(1),
    tags: z.array(z.string().min(1)).min(1),
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

const gameEditorialContentSchema = z.object({
    title: z.string().min(1),
    desc: z.string().min(1),
    mechanic: z.string().min(1),
    verdict: z.string().min(1),
});

type EditorialCatalogRecord = Record<string, GameEditorialContent>;

const parsedStructuralCatalog = z.array(gameCatalogSchema).parse(gamesStructuralJson);
const parsedPtEditorialCatalog = z.record(z.string(), gameEditorialContentSchema).parse(
    gamesEditorialPtJson
) as EditorialCatalogRecord;

const editorialCatalogByLocale: Record<SupportedGameLocale, EditorialCatalogRecord> = {
    pt: parsedPtEditorialCatalog,
};

const gamesCache = new Map<string, Game[]>();

function normalizeLocale(language?: string | null): SupportedGameLocale {
    if (!language) {
        return fallbackEditorialLocale;
    }

    const baseLanguage = language.toLowerCase().split('-')[0];
    const matchedLocale = editorialLocales.find((locale) => locale === baseLanguage);
    return matchedLocale ?? fallbackEditorialLocale;
}

function resolveEditorialCatalog(locale: SupportedGameLocale): EditorialCatalogRecord {
    return editorialCatalogByLocale[locale] ?? editorialCatalogByLocale[fallbackEditorialLocale];
}

function buildGamesForLocale(locale: SupportedGameLocale): Game[] {
    const editorialCatalog = resolveEditorialCatalog(locale);
    const fallbackCatalog = editorialCatalogByLocale[fallbackEditorialLocale];

    return parsedStructuralCatalog.map((gameEntry) => {
        const editorialContent =
            editorialCatalog[String(gameEntry.id)] ?? fallbackCatalog[String(gameEntry.id)];

        if (!editorialContent) {
            if (import.meta.env.DEV) {
                console.warn(`Missing editorial content for game id ${gameEntry.id} and locale ${locale}`);
            }

            return {
                ...gameEntry,
                title: `Game #${gameEntry.id}`,
                desc: '',
                mechanic: '',
                verdict: '',
                price: gameEntry.catalogPrice,
                imgUrl: gameEntry.imgUrl ?? undefined,
                storeUrl: gameEntry.storeUrl ?? undefined,
                youtubeUrl: gameEntry.youtubeUrl ?? undefined,
            } satisfies Game;
        }

        return {
            ...gameEntry,
            ...editorialContent,
            price: gameEntry.catalogPrice,
            imgUrl: gameEntry.imgUrl ?? undefined,
            storeUrl: gameEntry.storeUrl ?? undefined,
            youtubeUrl: gameEntry.youtubeUrl ?? undefined,
        } satisfies Game;
    });
}

export function hasNativeEditorialForLanguage(language?: string | null): boolean {
    const baseLanguage = (language || '').toLowerCase().split('-')[0];
    return editorialLocales.some((locale) => locale === baseLanguage);
}

export function getGamesForLanguage(language?: string | null): Game[] {
    const normalizedLocale = normalizeLocale(language);
    const cacheKey = normalizedLocale;
    const cachedGames = gamesCache.get(cacheKey);

    if (cachedGames) {
        return cachedGames;
    }

    const localizedGames = buildGamesForLocale(normalizedLocale);
    gamesCache.set(cacheKey, localizedGames);

    return localizedGames;
}

export const games = getGamesForLanguage('pt');
