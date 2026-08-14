/**
 * Read-only collectors for public game-data sources. Every collector fails soft
 * (returns null) so one dead source never aborts a long research run, and every
 * returned value carries the URL a human can open to verify the claim.
 */

const PCGW_USER_AGENT = 'amigos-database-research-tool/2.0 (local dev tool; friends game-picker app)';
const WIKIDATA_USER_AGENT = PCGW_USER_AGENT;
const FETCH_TIMEOUT_MS = 20_000;

export interface SteamDetails {
    appId: string;
    url: string;
    name: string;
    isFree: boolean;
    shortDescription: string;
    detailedDescription: string;
    genres: string[];
    categories: string[];
    minimumRequirements: string;
    releaseDate: string | null;
    developers: string[];
    publishers: string[];
    metacritic: number | null;
    installSizeMb: number | null;
}

export interface SteamReviewSignal {
    url: string;
    scoreDescription: string;
    totalPositive: number;
    totalNegative: number;
    totalReviews: number;
    sampleReviews: string[];
}

export interface PcgwMultiplayer {
    page: string;
    url: string;
    local: string | null;
    localPlayers: number | null;
    lan: string | null;
    lanPlayers: number | null;
    online: string | null;
    onlinePlayers: number | null;
    crossplay: string | null;
}

export interface PcgwInfobox {
    page: string;
    url: string;
    released: string | null;
    developers: string | null;
    genres: string | null;
    modes: string | null;
    series: string | null;
}

export interface WikidataPlayers {
    entityId: string;
    url: string;
    minPlayers: number | null;
    maxPlayers: number | null;
    allMaxClaims: number[];
}

async function fetchWithTimeout(url: string | URL, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function stripHtml(value: string): string {
    return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseInstallSizeMb(requirementsHtml: string): number | null {
    const plainText = stripHtml(requirementsHtml);
    const match = plainText.match(/(?:Storage|Hard Drive|Disk Space|Available Space)[^:]*:\s*([\d.,]+)\s*(GB|MB)/i);
    if (!match?.[1] || !match[2]) return null;
    const value = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return null;
    return match[2].toUpperCase() === 'GB' ? Math.round(value * 1024) : Math.round(value);
}

export async function fetchSteamDetails(appId: string): Promise<SteamDetails | null> {
    try {
        const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english&cc=us`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) return null;
        const payload = await response.json() as Record<string, {
            success: boolean;
            data?: {
                name?: string;
                is_free?: boolean;
                short_description?: string;
                detailed_description?: string;
                genres?: { description: string }[];
                categories?: { description: string }[];
                pc_requirements?: { minimum?: string } | unknown[];
                release_date?: { date?: string };
                developers?: string[];
                publishers?: string[];
                metacritic?: { score?: number };
            };
        }>;
        const data = payload[appId];
        if (!data?.success || !data.data) return null;
        const entry = data.data;
        const requirements = !Array.isArray(entry.pc_requirements) ? entry.pc_requirements?.minimum ?? '' : '';
        return {
            appId,
            url: `https://store.steampowered.com/app/${appId}/`,
            name: entry.name ?? '',
            isFree: entry.is_free ?? false,
            shortDescription: stripHtml(entry.short_description ?? ''),
            detailedDescription: stripHtml(entry.detailed_description ?? '').slice(0, 2500),
            genres: (entry.genres ?? []).map((genre) => genre.description),
            categories: (entry.categories ?? []).map((category) => category.description),
            minimumRequirements: stripHtml(requirements).slice(0, 900),
            releaseDate: entry.release_date?.date ?? null,
            developers: entry.developers ?? [],
            publishers: entry.publishers ?? [],
            metacritic: entry.metacritic?.score ?? null,
            installSizeMb: parseInstallSizeMb(requirements),
        };
    } catch {
        return null;
    }
}

export async function fetchSteamReviewSignal(appId: string): Promise<SteamReviewSignal | null> {
    try {
        const url = `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&num_per_page=8`
            + '&purchase_type=all&review_type=all&filter=all';
        const response = await fetchWithTimeout(url);
        if (!response.ok) return null;
        const payload = await response.json() as {
            success?: number;
            query_summary?: {
                review_score_desc?: string;
                total_positive?: number;
                total_negative?: number;
                total_reviews?: number;
            };
            reviews?: { review?: string; voted_up?: boolean }[];
        };
        if (!payload.query_summary) return null;
        const summary = payload.query_summary;
        const sampleReviews = (payload.reviews ?? [])
            .map((review) => stripHtml(review.review ?? ''))
            .filter((text) => text.length > 60)
            .slice(0, 5)
            .map((text) => text.slice(0, 450));
        return {
            url: `https://store.steampowered.com/app/${appId}/#app_reviews_hash`,
            scoreDescription: summary.review_score_desc ?? 'unknown',
            totalPositive: summary.total_positive ?? 0,
            totalNegative: summary.total_negative ?? 0,
            totalReviews: summary.total_reviews ?? 0,
            sampleReviews,
        };
    } catch {
        return null;
    }
}

function pcgwPageUrl(page: string): string {
    return `https://www.pcgamingwiki.com/wiki/${encodeURIComponent(page.replace(/ /g, '_'))}`;
}

function decodeWikiText(value: string | undefined | null): string | null {
    if (!value) return null;
    const decoded = value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim();
    return decoded.length > 0 ? decoded : null;
}

function parsePlayerCount(value: string | undefined | null): number | null {
    if (!value) return null;
    const match = value.match(/\d+/g);
    if (!match || match.length === 0) return null;
    const numbers = match.map(Number).filter((entry) => Number.isInteger(entry) && entry > 0);
    if (numbers.length === 0) return null;
    return Math.max(...numbers);
}

async function queryPcgwCargo(
    table: string,
    fields: string[],
    pageName: string
): Promise<Record<string, string> | null> {
    const url = new URL('https://www.pcgamingwiki.com/w/api.php');
    url.searchParams.set('action', 'cargoquery');
    url.searchParams.set('tables', table);
    url.searchParams.set('fields', fields.join(','));
    url.searchParams.set('where', `${table}._pageName="${pageName.replace(/"/g, '\\"')}"`);
    url.searchParams.set('format', 'json');
    const response = await fetchWithTimeout(url, { headers: { 'User-Agent': PCGW_USER_AGENT } });
    if (!response.ok) return null;
    const payload = await response.json() as { cargoquery?: { title: Record<string, string> }[] };
    return payload.cargoquery?.[0]?.title ?? null;
}

export async function fetchPcgwMultiplayer(titleCandidates: string[]): Promise<PcgwMultiplayer | null> {
    for (const candidate of titleCandidates) {
        try {
            const row = await queryPcgwCargo('Multiplayer', [
                'Multiplayer._pageName=Page',
                'Multiplayer.Local=Local',
                'Multiplayer.Local_players=LocalPlayers',
                'Multiplayer.LAN=LAN',
                'Multiplayer.LAN_players=LanPlayers',
                'Multiplayer.Online=Online',
                'Multiplayer.Online_players=OnlinePlayers',
                'Multiplayer.Crossplay=Crossplay',
            ], candidate);
            if (!row) continue;
            const page = decodeWikiText(row.Page) ?? candidate;
            return {
                page,
                url: pcgwPageUrl(page),
                local: decodeWikiText(row.Local),
                localPlayers: parsePlayerCount(row.LocalPlayers),
                lan: decodeWikiText(row.LAN),
                lanPlayers: parsePlayerCount(row.LanPlayers),
                online: decodeWikiText(row.Online),
                onlinePlayers: parsePlayerCount(row.OnlinePlayers),
                crossplay: decodeWikiText(row.Crossplay),
            };
        } catch {
            // fall through to the next candidate title
        }
    }
    return null;
}

export async function fetchPcgwInfobox(pageName: string): Promise<PcgwInfobox | null> {
    try {
        const row = await queryPcgwCargo('Infobox_game', [
            'Infobox_game._pageName=Page',
            'Infobox_game.Released=Released',
            'Infobox_game.Developers=Developers',
            'Infobox_game.Genres=Genres',
            'Infobox_game.Modes=Modes',
            'Infobox_game.Series=Series',
        ], pageName);
        if (!row) return null;
        const page = decodeWikiText(row.Page) ?? pageName;
        return {
            page,
            url: pcgwPageUrl(page),
            released: decodeWikiText(row.Released),
            developers: decodeWikiText(row.Developers)?.replace(/Company:/g, '') ?? null,
            genres: decodeWikiText(row.Genres),
            modes: decodeWikiText(row.Modes),
            series: decodeWikiText(row.Series),
        };
    } catch {
        return null;
    }
}

export async function fetchWikidataPlayers(title: string): Promise<WikidataPlayers | null> {
    const escaped = title.replace(/["\\]/g, '\\$&');
    const query = `SELECT ?item ?minP ?maxP WHERE {
        ?item rdfs:label "${escaped}"@en .
        ?item wdt:P31/wdt:P279* wd:Q7889 .
        OPTIONAL { ?item wdt:P1872 ?minP }
        OPTIONAL { ?item wdt:P1873 ?maxP }
    } LIMIT 12`;
    try {
        const url = new URL('https://query.wikidata.org/sparql');
        url.searchParams.set('query', query);
        const response = await fetchWithTimeout(url, {
            headers: { Accept: 'application/sparql-results+json', 'User-Agent': WIKIDATA_USER_AGENT },
        });
        if (!response.ok) return null;
        const payload = await response.json() as {
            results?: { bindings?: { item?: { value: string }; minP?: { value: string }; maxP?: { value: string } }[] };
        };
        const bindings = payload.results?.bindings ?? [];
        if (bindings.length === 0) return null;
        const entityUri = bindings[0]?.item?.value ?? '';
        const entityId = entityUri.split('/').pop() ?? '';
        const minClaims = bindings.map((row) => Number(row.minP?.value)).filter(Number.isFinite);
        const maxClaims = bindings.map((row) => Number(row.maxP?.value)).filter(Number.isFinite);
        if (minClaims.length === 0 && maxClaims.length === 0) return null;
        return {
            entityId,
            url: entityUri || `https://www.wikidata.org/wiki/${entityId}`,
            minPlayers: minClaims.length > 0 ? Math.min(...minClaims) : null,
            maxPlayers: maxClaims.length > 0 ? Math.max(...maxClaims) : null,
            allMaxClaims: [...new Set(maxClaims)].sort((a, b) => a - b),
        };
    } catch {
        return null;
    }
}
