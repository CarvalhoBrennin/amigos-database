import type { Game, GameTypeFilter, SortOption, GameStats, Difficulty } from '@/types/game';
import { statLabels } from '@/data/games';
import {
    extractSteamAppIdFromUrl,
    getHighQualitySteamImage,
    getSteamHeaderImage,
    getSteamStoreUrl,
} from '@/utils/steam';

export { extractSteamAppIdFromUrl as extractSteamAppId, getHighQualitySteamImage, getSteamHeaderImage, getSteamStoreUrl };

export type FormatPlayersFn = (players: [number, number]) => string;

export function formatPlayersWith(
    players: [number, number],
    format: FormatPlayersFn
): string {
    return format(players);
}

const PLACEHOLDER_BG = '#1c1917';
const PLACEHOLDER_FG = '#f59e0b';
const AVATAR_BG = '#0d8abc';
const AVATAR_FG = '#ffffff';

function escapeXml(value: string): string {
    return value.replace(/[<>&'"]/g, (char) => {
        switch (char) {
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '&':
                return '&amp;';
            case "'":
                return '&apos;';
            default:
                return '&quot;';
        }
    });
}

function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
        return ['Game'];
    }

    const lines: string[] = [];
    let current = '';

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > maxCharsPerLine && current) {
            lines.push(current);
            current = word;
            if (lines.length === maxLines - 1) {
                break;
            }
        } else {
            current = candidate;
        }
    }

    const consumed = lines.join(' ').split(/\s+/).filter(Boolean).length;
    const remaining = words.slice(consumed).join(' ');
    if (remaining) {
        lines.push(remaining);
    } else if (current && lines.length < maxLines) {
        lines.push(current);
    }

    return lines.slice(0, maxLines);
}

function toSvgDataUri(svg: string): string {
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Placeholder SVG 600x400 com o nome do jogo. */
export function getPlaceholderImage(query: string): string {
    const lines = wrapText(query || 'Game', 16, 3);
    const fontSize = 46;
    const lineHeight = 56;
    const firstY = 200 - ((lines.length - 1) * lineHeight) / 2 + fontSize / 3;
    const tspans = lines
        .map((line, index) => `<tspan x="300" y="${firstY + index * lineHeight}">${escapeXml(line)}</tspan>`)
        .join('');

    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" role="img">` +
        `<rect width="600" height="400" fill="${PLACEHOLDER_BG}"/>` +
        `<text text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" ` +
        `font-size="${fontSize}" font-weight="700" fill="${PLACEHOLDER_FG}">${tspans}</text>` +
        `</svg>`;

    return toSvgDataUri(svg);
}

/** Avatar com iniciais em SVG inline. */
export function getInitialsPlaceholder(name: string): string {
    const initials =
        name
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((word) => word.charAt(0).toUpperCase())
            .join('') || '?';

    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img">` +
        `<rect width="256" height="256" fill="${AVATAR_BG}"/>` +
        `<text x="128" y="128" text-anchor="middle" dominant-baseline="central" ` +
        `font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="112" ` +
        `font-weight="600" fill="${AVATAR_FG}">${escapeXml(initials)}</text>` +
        `</svg>`;

    return toSvgDataUri(svg);
}

const difficultyStyles: Record<Difficulty, string> = {
    'Fácil': 'text-green-400',
    'Moderada': 'text-yellow-400',
    'Difícil': 'text-orange-400',
    'Brutal': 'text-red-400',
};

export function getDifficultyStyle(diff: Difficulty | string): string {
    return difficultyStyles[diff as Difficulty] || 'text-stone-400';
}

export function getTypeBadgeStyle(type: Game['type']): string {
    const styles: Record<Game['type'], string> = {
        coop_campaign: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
        survival: 'bg-red-500/20 text-red-400 border-red-500/50',
        roguelike: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
        puzzle: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
        tactical_action: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
        simulation: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50',
        party: 'bg-pink-500/20 text-pink-400 border-pink-500/50',
    };
    return styles[type];
}

export function filterByType(games: Game[], type: GameTypeFilter): Game[] {
    if (type === 'all' || !type) return games;
    return games.filter((game) => game.type === type);
}

export function filterByPlayers(games: Game[], minPlayers: number): Game[] {
    if (minPlayers <= 1) return games;
    return games.filter(
        (game) => minPlayers >= game.players[0] && minPlayers <= game.players[1]
    );
}

export function searchGames(games: Game[], query: string): Game[] {
    if (!query.trim()) return games;
    const lowerQuery = query.toLowerCase();
    return games.filter(
        (game) =>
            game.title.toLowerCase().includes(lowerQuery) ||
            game.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
}

export function sortGames(games: Game[], sortBy: SortOption): Game[] {
    const sorted = [...games];

    switch (sortBy) {
        case 'rating':
            return sorted.sort((a, b) => b.rating - a.rating);
        case 'title':
            return sorted.sort((a, b) => a.title.localeCompare(b.title));
        case 'year':
            return sorted.sort((a, b) => b.year - a.year);
        case 'players':
            return sorted.sort((a, b) => b.players[1] - a.players[1]);
        default:
            return sorted;
    }
}

export function applyFilters(
    games: Game[],
    type: GameTypeFilter,
    search: string,
    sort: SortOption,
    playerMin: number
): Game[] {
    let filtered = filterByType(games, type);
    filtered = filterByPlayers(filtered, playerMin);
    filtered = searchGames(filtered, search);
    filtered = sortGames(filtered, sort);
    return filtered;
}

export function getRadarData(stats: number[], translate: (key: string) => string): GameStats[] {
    return statLabels.map((labelKey, index) => ({
        dimension: translate(labelKey),
        value: stats[index] ?? 0,
        fullMark: 10,
    }));
}

export function debounce<T extends (...args: Parameters<T>) => void>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

export function getYoutubeSearchUrl(title: string): string {
    const query = encodeURIComponent(`${title} gameplay coop`);
    return `https://www.youtube.com/results?search_query=${query}`;
}

// Mantido para testes; na UI use formatPlayersWith.
export function formatPlayers(players: [number, number]): string {
    if (players[0] === players[1]) {
        return `${players[0]} jogador${players[0] > 1 ? 'es' : ''}`;
    }
    return `${players[0]}-${players[1]} jogadores`;
}
