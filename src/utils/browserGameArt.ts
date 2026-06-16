import type { GameCategory } from '@/data/browserGames';

interface CategoryTheme {
    from: string;
    to: string;
    accent: string;
    symbol: string;
}

const CATEGORY_THEMES: Record<GameCategory, CategoryTheme> = {
    drawing: { from: '#be185d', to: '#581c87', accent: '#fda4af', symbol: '✎' },
    word: { from: '#0284c7', to: '#1e3a8a', accent: '#7dd3fc', symbol: 'Aa' },
    strategy: { from: '#d97706', to: '#9a3412', accent: '#fcd34d', symbol: '♟' },
    quiz: { from: '#7c3aed', to: '#3730a3', accent: '#c4b5fd', symbol: '?' },
    social_deduction: { from: '#dc2626', to: '#7f1d1d', accent: '#fca5a5', symbol: '◉' },
    party: { from: '#db2777', to: '#86198f', accent: '#f9a8d4', symbol: '★' },
};

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
        lines.push(remaining.length > maxCharsPerLine + 3 ? `${remaining.slice(0, maxCharsPerLine)}…` : remaining);
    } else if (current && lines.length < maxLines) {
        lines.push(current);
    }

    return lines.slice(0, maxLines);
}

function hashString(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
}

function toSvgDataUri(svg: string): string {
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function getBrowserGameFavicon(pageUrl: string): string {
    try {
        const origin = new URL(pageUrl).origin;
        const params = new URLSearchParams({
            client: 'SOCIAL',
            type: 'FAVICON',
            fallback_opts: 'TYPE,SIZE,URL',
            url: origin,
            size: '128',
        });
        return `https://t1.gstatic.com/faviconV2?${params.toString()}`;
    } catch {
        return '';
    }
}

/** Arte SVG por categoria para cards de browser games. */
export function getBrowserGameArtUrl(category: GameCategory, title: string): string {
    const theme = CATEGORY_THEMES[category];
    const variant = hashString(title);
    const orbX = 420 + (variant % 80);
    const orbY = 60 + (variant % 60);
    const orbR = 100 + (variant % 40);
    const lines = wrapText(title, 18, 2);
    const fontSize = lines.length > 1 ? 34 : 40;
    const lineHeight = 42;
    const firstY = 330 - ((lines.length - 1) * lineHeight) / 2;
    const titleSpans = lines
        .map((line, index) => `<tspan x="32" y="${firstY + index * lineHeight}">${escapeXml(line)}</tspan>`)
        .join('');

    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" role="img">` +
        `<defs>` +
        `<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">` +
        `<stop offset="0%" stop-color="${theme.from}"/>` +
        `<stop offset="100%" stop-color="${theme.to}"/>` +
        `</linearGradient>` +
        `</defs>` +
        `<rect width="600" height="400" fill="url(#bg)"/>` +
        `<circle cx="${orbX}" cy="${orbY}" r="${orbR}" fill="${theme.accent}" opacity="0.18"/>` +
        `<circle cx="96" cy="300" r="72" fill="${theme.accent}" opacity="0.12"/>` +
        `<circle cx="520" cy="320" r="48" fill="#ffffff" opacity="0.06"/>` +
        `<text x="520" y="118" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" ` +
        `font-size="72" font-weight="700" fill="#ffffff" opacity="0.22">${escapeXml(theme.symbol)}</text>` +
        `<text font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="${fontSize}" ` +
        `font-weight="700" fill="#fafaf9">${titleSpans}</text>` +
        `</svg>`;

    return toSvgDataUri(svg);
}
