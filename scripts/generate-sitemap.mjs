import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const siteUrl = (process.env.VITE_SITE_URL || 'https://amigos-database.vercel.app').replace(/\/$/, '');

const structuralCatalog = JSON.parse(
    readFileSync(join(rootDir, 'src/content/catalog/games.structural.json'), 'utf8')
);

const staticPaths = ['/', '/catalog', '/browser-games', '/about'];
const gamePaths = structuralCatalog.map((game) => `/game/${game.id}`);
const allPaths = [...staticPaths, ...gamePaths];
const lastmod = new Date().toISOString().slice(0, 10);

const urlEntries = allPaths
    .map(
        (path) => `  <url>
    <loc>${siteUrl}${path === '/' ? '' : path}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`
    )
    .join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`;

writeFileSync(join(rootDir, 'public/sitemap.xml'), sitemap, 'utf8');

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;

writeFileSync(join(rootDir, 'public/robots.txt'), robots, 'utf8');
console.log(`[sitemap] Generated ${allPaths.length} URLs for ${siteUrl}`);
console.log(`[robots] Generated robots.txt for ${siteUrl}`);
