import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Coloque os JSON de origem em public/ antes de rodar o script.
const structuralSource = join(rootDir, 'public/amigosdb_jogos_243.json');
const browserSource = join(rootDir, 'public/browserGames_expanded_280.json');
const structuralTarget = join(rootDir, 'src/content/catalog/games.structural.json');
const editorialTarget = join(rootDir, 'src/content/catalog/games.editorial.pt.json');
const browserTarget = join(rootDir, 'src/content/browserGames.data.json');

const TYPE_LABELS = {
    coop_campaign: 'campanha cooperativa',
    survival: 'sobrevivência',
    roguelike: 'roguelike',
    puzzle: 'puzzle cooperativo',
    tactical_action: 'ação tática',
    simulation: 'simulação',
    party: 'party game',
};

function titleFromImgQ(imgQ) {
    return imgQ
        .replace(/\s*gameplay screenshot$/i, '')
        .replace(/\s*co-?op gameplay.*$/i, '')
        .replace(/\s*screenshot$/i, '')
        .trim();
}

function buildEditorialEntry(game) {
    const title = titleFromImgQ(game.imgQ);
    const typeLabel = TYPE_LABELS[game.type] ?? 'experiência cooperativa';
    const tagLine = game.tags.slice(0, 3).join(', ');
    const players =
        game.players[0] === game.players[1]
            ? `${game.players[0]} jogadores`
            : `${game.players[0]}-${game.players[1]} jogadores`;

    return {
        title,
        desc: `${title} entra no catálogo como ${typeLabel}, com foco em ${tagLine.toLowerCase()}. Ideal para grupos de ${players}.`,
        mechanic: `Sessões típicas de ${game.session}. Dificuldade ${game.diff.toLowerCase()} e nota ${game.rating}/10.`,
        verdict: `Entrada curada do AMIGOS Database. Confira tags, stats e gameplay antes de fechar a escolha com o grupo.`,
    };
}

function assertSource(path, label) {
    if (!existsSync(path)) {
        console.error(`[import] Missing ${label}: ${path}`);
        console.error('[import] Add the source JSON to public/ before running this script.');
        process.exit(1);
    }
}

assertSource(structuralSource, 'catalog JSON');
assertSource(browserSource, 'browser games JSON');

const structuralCatalog = JSON.parse(readFileSync(structuralSource, 'utf8'));
const existingEditorial = JSON.parse(readFileSync(editorialTarget, 'utf8'));
const browserCatalog = JSON.parse(readFileSync(browserSource, 'utf8'));

const mergedEditorial = { ...existingEditorial };

for (const game of structuralCatalog) {
    const key = String(game.id);
    if (!mergedEditorial[key]) {
        mergedEditorial[key] = buildEditorialEntry(game);
    }
}

writeFileSync(structuralTarget, `${JSON.stringify(structuralCatalog, null, 2)}\n`, 'utf8');
writeFileSync(editorialTarget, `${JSON.stringify(mergedEditorial, null, 2)}\n`, 'utf8');
writeFileSync(browserTarget, `${JSON.stringify(browserCatalog, null, 2)}\n`, 'utf8');

console.log(`[import] Catalog structural: ${structuralCatalog.length} games`);
console.log(`[import] Catalog editorial (pt): ${Object.keys(mergedEditorial).length} entries`);
console.log(`[import] Browser games: ${browserCatalog.length} games`);
