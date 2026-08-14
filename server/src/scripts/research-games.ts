/**
 * Deep research pass over the game catalog.
 *
 * For each target game it collects evidence from five public sources plus the
 * internal catalog, reconciles the objective fields deterministically (flagging
 * every disagreement), then asks a local LLM to write a dossier and score the
 * subjective axes, critiquing and revising its own output until it passes review.
 *
 * Objective fields come from sources a human can open and check. Subjective axes
 * and the dossier prose are model judgement and are labelled as such everywhere.
 * Profiles are always written as PARTIAL: promoting to COMPLETE stays a human call.
 */

import { loadEnvFile } from 'node:process';
import { appendFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { decisionDataImportSchema, type DecisionDataGameImport } from '../../../shared/index.js';
import { StaticJsonCatalogGateway } from '../modules/catalog/static-json-catalog-gateway.js';
import type { CatalogGame } from '../modules/catalog/catalog-gateway.js';
import { runInTransaction } from './import-utils.js';
import { upsertDecisionProfile, upsertPlatformOffering } from './decision-data-upsert.js';
import { buildDossier, checkOllamaModel, type AgentConfig, type DossierResult } from './research/dossier-agent.js';
import {
    fetchPcgwInfobox,
    fetchPcgwMultiplayer,
    fetchSteamDetails,
    fetchSteamReviewSignal,
    fetchWikidataPlayers,
    type PcgwInfobox,
    type PcgwMultiplayer,
    type SteamDetails,
    type SteamReviewSignal,
    type WikidataPlayers,
} from './research/evidence-sources.js';

try {
    loadEnvFile('.env');
} catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error;
    }
}

const STEAM_APP_ID_PATTERN = /\/apps\/(\d+)\//;
const POLITE_DELAY_MS = 900;
const ONLINE_CATEGORY_PATTERN = /Online Co-op|Online PvP|MMO|Cross-Platform Multiplayer|Multi-player/i;

interface CliOptions {
    limit: number;
    gameId: string | null;
    outDir: string;
    refresh: boolean;
    apply: boolean;
    maxRounds: number;
    redo: boolean;
}

interface FieldAudit {
    field: string;
    value: string;
    sources: string;
    status: 'agree' | 'conflict' | 'single-source' | 'unavailable' | 'ai-judgement';
    note?: string;
}

interface Evidence {
    steam: SteamDetails;
    reviews: SteamReviewSignal | null;
    multiplayer: PcgwMultiplayer | null;
    infobox: PcgwInfobox | null;
    wikidata: WikidataPlayers | null;
}

const skipped: { gameId: string; title: string; reason: string }[] = [];

async function main(): Promise<void> {
    const options = parseCliOptions(process.argv.slice(2));
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
            ?? 'postgresql://amigos:amigos_local_only@localhost:5432/amigos',
    });
    const agentConfig: AgentConfig = {
        ollamaUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
        model: process.env.OLLAMA_MODEL ?? 'qwen3:8b',
        maxRounds: options.maxRounds,
        contextTokens: Number(process.env.OLLAMA_NUM_CTX ?? 8192),
    };

    try {
        if (!await checkOllamaModel(agentConfig)) {
            throw new Error(
                `Ollama model "${agentConfig.model}" is not reachable at ${agentConfig.ollamaUrl}. `
                + 'Start Ollama (ollama serve) and confirm the model is pulled.'
            );
        }

        const catalog = await StaticJsonCatalogGateway.create();
        const games = await catalog.listGames();
        const targetIds = await findTargetIds(pool, catalog, options.refresh);
        const alreadyDone = await findAlreadyDossiered(options.outDir, options.redo || Boolean(options.gameId));
        const targets = games
            .filter((game) => options.gameId
                ? game.id === options.gameId
                : targetIds.has(game.id) && !alreadyDone.has(game.id))
            .slice(0, options.limit);

        if (targets.length === 0) {
            process.stdout.write('Nothing to research (every catalog game already has a profile or dossier, or --game-id did not match).\n');
            return;
        }
        if (alreadyDone.size > 0) {
            process.stdout.write(`Resuming: ${alreadyDone.size} game(s) already have a dossier and will be skipped (--redo to force).\n`);
        }

        await mkdir(path.join(options.outDir, 'dossiers'), { recursive: true });
        const runId = new Date().toISOString().replace(/[:.]/g, '-');
        const importPath = path.join(options.outDir, `${runId}-decision-data.json`);
        const auditPath = path.join(options.outDir, `${runId}-audit-report.md`);
        await writeFile(auditPath, auditHeader(), 'utf8');

        const collected: DecisionDataGameImport[] = [];
        let approvedCount = 0;
        let conflictCount = 0;
        let index = 0;

        for (const game of targets) {
            index += 1;
            const tag = `[${index}/${targets.length}] id ${game.id} "${game.title}"`;
            const evidence = await collectEvidence(game, tag);
            if (!evidence) continue;

            const { profileGame, audit } = reconcile(game, evidence);
            conflictCount += audit.filter((entry) => entry.status === 'conflict').length;
            for (const conflict of audit.filter((entry) => entry.status === 'conflict')) {
                log(`${tag} — ⚠ CONFLITO em ${conflict.field}: ${conflict.note}`);
            }

            log(`${tag} — escrevendo dossiê com ${agentConfig.model} (rascunho → auto-revisão)...`);
            const dossier = await buildDossier(renderEvidence(game, evidence), game.title, {
                ...agentConfig,
                onProgress: (message) => log(`${tag} — ${message}`),
            });

            if (dossier) {
                applyDossier(profileGame, dossier);
                audit.push({
                    field: 'eixos + dificuldade + tier de PC',
                    value: `comm=${dossier.draft.communication} skill=${dossier.draft.skill} chaos=${dossier.draft.chaos} strategy=${dossier.draft.strategy} story=${dossier.draft.story} ${dossier.draft.difficultyCode} ${dossier.draft.minPcTier}`,
                    sources: `${agentConfig.model} (julgamento do modelo, não verificado)`,
                    status: 'ai-judgement',
                    note: `${dossier.rounds} rodada(s) de revisão, ${dossier.approved ? 'aprovado pelo revisor' : 'NÃO aprovado — revise manualmente'}`,
                });
                if (dossier.approved) approvedCount += 1;
                log(`${tag} — ${dossier.approved ? '✓ aprovado' : '✗ não aprovado'} em ${dossier.rounds} rodada(s) · comm=${dossier.draft.communication} skill=${dossier.draft.skill} chaos=${dossier.draft.chaos} strategy=${dossier.draft.strategy} story=${dossier.draft.story} ${dossier.draft.difficultyCode}/${dossier.draft.minPcTier}`);
                await writeFile(
                    path.join(options.outDir, 'dossiers', `${game.id}-${slugify(game.title)}.md`),
                    renderDossier(game, evidence, profileGame, dossier, audit),
                    'utf8'
                );
            } else {
                log(`${tag} — ✗ dossiê falhou (modelo indisponível ou resposta inválida); campos objetivos preservados`);
                audit.push({
                    field: 'eixos + dificuldade + tier de PC',
                    value: 'não preenchido',
                    sources: 'modelo indisponível',
                    status: 'unavailable',
                });
            }

            collected.push(profileGame);
            await appendFile(auditPath, renderAuditEntry(game, evidence, audit), 'utf8');
            await writeFile(importPath, JSON.stringify(toImportPayload(collected), null, 2), 'utf8');

            if (options.apply) {
                await runInTransaction(pool, async (client) => {
                    const counters = { inserted: 0, updated: 0 };
                    await upsertDecisionProfile(client, profileGame.gameId, profileGame.profile, counters);
                    for (const offering of profileGame.offerings) {
                        await upsertPlatformOffering(client, profileGame.gameId, offering, counters);
                    }
                });
                log(`${tag} — gravado no banco (PARTIAL)`);
            }

            await sleep(POLITE_DELAY_MS);
        }

        decisionDataImportSchema.parse(toImportPayload(collected));
        log('');
        log(`Dossiês:       ${path.join(options.outDir, 'dossiers')}`);
        log(`Auditoria:     ${auditPath}`);
        log(`Import JSON:   ${importPath}`);
        if (!options.apply) {
            log(`Aplicar com:   npm run import:decision-data -- --file ${importPath} --apply`);
        }
        log(JSON.stringify({
            researched: collected.length,
            dossiersApproved: approvedCount,
            fieldConflicts: conflictCount,
            skipped: skipped.length,
            skippedGames: skipped,
            appliedToDatabase: options.apply,
        }, null, 2));
    } finally {
        await pool.end();
    }
}

function parseCliOptions(argv: string[]): CliOptions {
    const readValue = (flag: string): string | null => {
        const position = argv.indexOf(flag);
        return position >= 0 ? argv[position + 1] ?? null : null;
    };
    const limit = Number(readValue('--limit') ?? Number.MAX_SAFE_INTEGER);
    const maxRounds = Number(readValue('--max-rounds') ?? 3);
    return {
        limit: Number.isFinite(limit) && limit > 0 ? limit : Number.MAX_SAFE_INTEGER,
        gameId: readValue('--game-id'),
        outDir: readValue('--out') ?? 'data/imports/research-output',
        refresh: argv.includes('--refresh'),
        apply: argv.includes('--apply'),
        maxRounds: Number.isFinite(maxRounds) && maxRounds > 0 ? Math.min(maxRounds, 6) : 3,
        redo: argv.includes('--redo'),
    };
}

/**
 * A full catalog pass takes hours, so an interrupted run must resume rather than
 * start over: any game that already has a dossier file on disk is treated as done.
 * --redo ignores the existing files and researches everything again.
 */
async function findAlreadyDossiered(outDir: string, redo: boolean): Promise<Set<string>> {
    if (redo) return new Set();
    try {
        const files = await readdir(path.join(outDir, 'dossiers'));
        return new Set(files
            .map((file) => file.match(/^(\d+)-/)?.[1])
            .filter((id): id is string => Boolean(id)));
    } catch {
        return new Set();
    }
}

/**
 * Default target set = catalog games with no profile row yet, so repeated runs walk
 * forward through the catalog. Research always writes PARTIAL, so filtering on
 * "not COMPLETE" would re-select the same games forever. --refresh opts into redoing
 * everything that is not already COMPLETE.
 */
async function findTargetIds(pool: Pool, catalog: StaticJsonCatalogGateway, refresh: boolean): Promise<Set<string>> {
    const allIds = await catalog.listGameIds();
    const query = refresh
        ? `SELECT game_id FROM game_decision_profiles WHERE data_status = 'COMPLETE'`
        : 'SELECT game_id FROM game_decision_profiles';
    const result = await pool.query<{ game_id: string }>(query);
    const excluded = new Set(result.rows.map((row) => row.game_id));
    return new Set(allIds.filter((id) => !excluded.has(id)));
}

async function collectEvidence(game: CatalogGame, tag: string): Promise<Evidence | null> {
    const appId = extractSteamAppId(game.storeUrl) ?? extractSteamAppId(game.imageUrl);
    if (!appId) {
        log(`${tag} — PULADO (sem app id da Steam no catálogo)`);
        skipped.push({ gameId: game.id, title: game.title, reason: 'No Steam app id derivable from catalog data.' });
        return null;
    }

    log(`${tag} — Steam appdetails...`);
    const steam = await fetchSteamDetails(appId);
    if (!steam) {
        log(`${tag} — PULADO (Steam não retornou dados)`);
        skipped.push({ gameId: game.id, title: game.title, reason: 'Steam appdetails request failed or returned no data.' });
        return null;
    }
    await sleep(POLITE_DELAY_MS);

    log(`${tag} — Steam reviews...`);
    const reviews = await fetchSteamReviewSignal(appId);
    await sleep(POLITE_DELAY_MS);

    const titleCandidates = [...new Set([game.title, stripCoopSuffix(game.title), steam.name].filter(Boolean))];
    log(`${tag} — PCGamingWiki...`);
    const multiplayer = await fetchPcgwMultiplayer(titleCandidates);
    await sleep(POLITE_DELAY_MS);
    const infobox = multiplayer ? await fetchPcgwInfobox(multiplayer.page) : await fetchPcgwInfobox(titleCandidates[0] ?? game.title);
    await sleep(POLITE_DELAY_MS);

    log(`${tag} — Wikidata...`);
    const wikidata = await fetchWikidataPlayers(steam.name || game.title);
    await sleep(POLITE_DELAY_MS);

    const found = ['Steam', reviews && 'reviews', multiplayer && 'PCGW/multiplayer', infobox && 'PCGW/infobox', wikidata && 'Wikidata']
        .filter(Boolean).join(', ');
    log(`${tag} — fontes encontradas: ${found}`);
    return { steam, reviews, multiplayer, infobox, wikidata };
}

function reconcile(game: CatalogGame, evidence: Evidence): { profileGame: DecisionDataGameImport; audit: FieldAudit[] } {
    const now = new Date().toISOString();
    const audit: FieldAudit[] = [];
    const { steam, multiplayer, wikidata } = evidence;

    audit.push(steam.installSizeMb === null
        ? { field: 'installSizeMb', value: 'desconhecido', sources: 'Steam', status: 'unavailable', note: 'Não foi possível extrair o tamanho dos requisitos da Steam.' }
        : { field: 'installSizeMb', value: `${steam.installSizeMb} MB`, sources: 'Steam (requisitos mínimos)', status: 'single-source' });
    audit.push({ field: 'freeToPlay', value: String(steam.isFree), sources: 'Steam (is_free)', status: 'single-source' });

    const steamOnline = ONLINE_CATEGORY_PATTERN.test(steam.categories.join(' | '));
    const pcgwOnline = multiplayer?.online ? multiplayer.online.toLowerCase() === 'true' : null;
    let onlineSupported: boolean;
    if (pcgwOnline !== null && pcgwOnline !== steamOnline) {
        onlineSupported = pcgwOnline;
        audit.push({
            field: 'onlineSupported', value: String(onlineSupported), sources: 'Steam x PCGamingWiki', status: 'conflict',
            note: `As categorias da Steam sugerem online=${steamOnline} (as tags "Multi-player"/"Co-op" não separam local de online), mas o PCGamingWiki tem campo dedicado dizendo online=${pcgwOnline}. Adotado o PCGamingWiki por ser mais específico.`,
        });
    } else {
        onlineSupported = steamOnline || (pcgwOnline ?? false);
        audit.push({
            field: 'onlineSupported', value: String(onlineSupported),
            sources: pcgwOnline !== null ? 'Steam + PCGamingWiki' : 'Steam (categorias)',
            status: pcgwOnline !== null ? 'agree' : 'single-source',
        });
    }

    const candidates: { label: string; value: number }[] = [];
    if (multiplayer?.onlinePlayers) candidates.push({ label: `PCGamingWiki (${multiplayer.onlinePlayers})`, value: multiplayer.onlinePlayers });
    if (wikidata?.maxPlayers) candidates.push({ label: `Wikidata (${wikidata.maxPlayers})`, value: wikidata.maxPlayers });
    if (game.players[1]) candidates.push({ label: `catálogo interno (${game.players[1]})`, value: game.players[1] });

    let minOnlinePlayers: number | null = null;
    let maxOnlinePlayers: number | null = null;
    if (!onlineSupported) {
        audit.push({ field: 'jogadores online', value: 'n/a', sources: 'sem suporte online detectado', status: 'single-source' });
    } else if (candidates.length === 0) {
        audit.push({ field: 'maxOnlinePlayers', value: 'desconhecido', sources: 'nenhuma fonte', status: 'unavailable' });
    } else {
        maxOnlinePlayers = candidates[0]!.value;
        minOnlinePlayers = game.players[0] ?? null;
        const distinct = new Set(candidates.map((candidate) => candidate.value));
        audit.push(distinct.size > 1
            ? {
                field: 'maxOnlinePlayers', value: String(maxOnlinePlayers),
                sources: candidates.map((candidate) => candidate.label).join(' x '), status: 'conflict',
                note: `Fontes divergem: ${candidates.map((candidate) => candidate.label).join(', ')}. Adotado ${candidates[0]!.label} por precedência (PCGamingWiki > Wikidata > catálogo). Confira antes de promover a COMPLETE.`,
            }
            : {
                field: 'maxOnlinePlayers', value: String(maxOnlinePlayers),
                sources: candidates.map((candidate) => candidate.label).join(' + '),
                status: candidates.length > 1 ? 'agree' : 'single-source',
            });
    }

    const session = parseSessionMinutes(game.session);
    audit.push(session
        ? { field: 'sessionMinutes', value: `${session.min}-${session.max}`, sources: 'catálogo interno (campo session)', status: 'single-source', note: 'Sem fonte externa estruturada para duração de sessão.' }
        : { field: 'sessionMinutes', value: 'desconhecido', sources: 'catálogo interno', status: 'unavailable', note: `Não foi possível interpretar "${game.session}".` });

    return {
        profileGame: {
            gameId: game.id,
            profile: {
                minOnlinePlayers, maxOnlinePlayers,
                minSessionMinutes: session?.min ?? null,
                maxSessionMinutes: session?.max ?? null,
                installSizeMb: steam.installSizeMb,
                minPcTier: null,
                freeToPlay: steam.isFree,
                communication: null, skill: null, chaos: null, strategy: null, story: null,
                difficultyCode: null,
                dataStatus: 'PARTIAL',
                sourceType: 'ADMIN_IMPORT',
                sourceUrl: steam.url,
                lastVerifiedAt: now,
            },
            offerings: [{
                platformCode: 'PC_STEAM',
                regionCode: null,
                onlineSupported,
                freeToPlay: steam.isFree,
                requiresPaidOnlineSubscription: null,
                onlineRequirementVerificationStatus: 'UNKNOWN',
                sourceType: 'ADMIN_IMPORT',
                sourceUrl: steam.url,
                verificationStatus: 'UNKNOWN',
                lastVerifiedAt: now,
                validFrom: null,
                validUntil: null,
            }],
            networkPools: [],
        },
        audit,
    };
}

function applyDossier(profileGame: DecisionDataGameImport, dossier: DossierResult): void {
    profileGame.profile.communication = dossier.draft.communication;
    profileGame.profile.skill = dossier.draft.skill;
    profileGame.profile.chaos = dossier.draft.chaos;
    profileGame.profile.strategy = dossier.draft.strategy;
    profileGame.profile.story = dossier.draft.story;
    profileGame.profile.difficultyCode = dossier.draft.difficultyCode;
    profileGame.profile.minPcTier = dossier.draft.minPcTier;
}

function renderEvidence(game: CatalogGame, evidence: Evidence): string {
    const { steam, reviews, multiplayer, infobox, wikidata } = evidence;
    const lines = [
        `[STEAM — ${steam.url}]`,
        `Nome: ${steam.name}`,
        `Lançamento: ${steam.releaseDate ?? 'desconhecido'} · Desenvolvedora: ${steam.developers.join(', ') || 'desconhecida'}`,
        `Modelo: ${steam.isFree ? 'gratuito (free to play)' : 'pago'}`,
        `Gêneros: ${steam.genres.join(', ') || 'desconhecidos'}`,
        `Categorias: ${steam.categories.join(', ') || 'desconhecidas'}`,
        steam.metacritic ? `Metacritic: ${steam.metacritic}` : '',
        `Tamanho de instalação detectado: ${steam.installSizeMb ? `${steam.installSizeMb} MB` : 'não detectado'}`,
        `Requisitos mínimos: ${steam.minimumRequirements || 'não informados'}`,
        `Descrição curta: ${steam.shortDescription}`,
        `Descrição detalhada: ${steam.detailedDescription.slice(0, 1200)}`,
        '',
    ];

    if (reviews) {
        lines.push(
            `[AVALIAÇÕES STEAM — ${reviews.url}]`,
            `Resumo: ${reviews.scoreDescription} (${reviews.totalPositive} positivas / ${reviews.totalNegative} negativas de ${reviews.totalReviews})`,
            'Trechos de avaliações reais de jogadores:',
            ...reviews.sampleReviews.map((review, position) => `  ${position + 1}. "${review}"`),
            ''
        );
    }

    if (multiplayer) {
        lines.push(
            `[PCGAMINGWIKI MULTIPLAYER — ${multiplayer.url}]`,
            `Local: ${multiplayer.local ?? '?'} (${multiplayer.localPlayers ?? '?'} jogadores)`,
            `LAN: ${multiplayer.lan ?? '?'} (${multiplayer.lanPlayers ?? '?'} jogadores)`,
            `Online: ${multiplayer.online ?? '?'} (${multiplayer.onlinePlayers ?? '?'} jogadores)`,
            multiplayer.crossplay ? `Crossplay: ${multiplayer.crossplay}` : '',
            ''
        );
    } else {
        lines.push('[PCGAMINGWIKI MULTIPLAYER] Nenhuma página correspondente encontrada.', '');
    }

    if (infobox) {
        lines.push(
            `[PCGAMINGWIKI FICHA — ${infobox.url}]`,
            `Gêneros: ${infobox.genres ?? '?'} · Modos: ${infobox.modes ?? '?'}${infobox.series ? ` · Série: ${infobox.series}` : ''}`,
            ''
        );
    }

    if (wikidata) {
        lines.push(
            `[WIKIDATA — ${wikidata.url}]`,
            `Jogadores: mínimo ${wikidata.minPlayers ?? '?'}, máximo ${wikidata.maxPlayers ?? '?'}`
            + (wikidata.allMaxClaims.length > 1 ? ` (múltiplas declarações: ${wikidata.allMaxClaims.join(', ')} — modos diferentes)` : ''),
            ''
        );
    } else {
        lines.push('[WIKIDATA] Nenhuma entidade correspondente encontrada.', '');
    }

    lines.push(
        '[CATÁLOGO INTERNO DO APP]',
        `Faixa de jogadores registrada: ${game.players[0]}-${game.players[1]}`,
        `Duração de sessão registrada: ${game.session}`,
        `Dificuldade registrada: ${game.difficulty} · Nota interna: ${game.rating}`,
        `Tags: ${game.tags.join(', ')}`,
        `Descrição editorial existente: ${game.description}`,
        game.mechanic ? `Mecânica registrada: ${game.mechanic}` : '',
    );

    return lines.filter((line) => line !== '').join('\n');
}

function renderDossier(
    game: CatalogGame,
    evidence: Evidence,
    profileGame: DecisionDataGameImport,
    dossier: DossierResult,
    audit: FieldAudit[]
): string {
    const { draft } = dossier;
    const profile = profileGame.profile;
    const sourceLinks = [
        `- Steam: ${evidence.steam.url}`,
        evidence.reviews ? `- Avaliações Steam: ${evidence.reviews.url}` : null,
        evidence.multiplayer ? `- PCGamingWiki (multiplayer): ${evidence.multiplayer.url}` : null,
        evidence.infobox ? `- PCGamingWiki (ficha): ${evidence.infobox.url}` : null,
        evidence.wikidata ? `- Wikidata: ${evidence.wikidata.url}` : null,
        '- Catálogo interno do app (games.structural.json / games.editorial.pt.json)',
    ].filter(Boolean).join('\n');

    return `# ${game.title}

> Dossiê gerado automaticamente em ${new Date().toISOString()}.
> Revisão do próprio modelo: **${dossier.approved ? 'aprovado' : 'NÃO aprovado'}** após ${dossier.rounds} rodada(s).
> Perfil gravado como \`PARTIAL\` — promover para \`COMPLETE\` continua sendo decisão humana.

## Visão geral

${draft.overview}

## Dinâmica em grupo

${draft.groupDynamics}

## Justificativa dos eixos

${draft.axisRationale}

| Eixo | Valor |
| --- | --- |
| Comunicação | ${draft.communication} |
| Habilidade | ${draft.skill} |
| Caos | ${draft.chaos} |
| Estratégia | ${draft.strategy} |
| História | ${draft.story} |
| Dificuldade | ${draft.difficultyCode} |
| PC mínimo | ${draft.minPcTier} |

## Acesso e requisitos

${draft.accessNotes}

## Ressalvas

${draft.caveats}

## Dados objetivos gravados

| Campo | Valor | Origem |
| --- | --- | --- |
${audit.filter((entry) => entry.status !== 'ai-judgement')
        .map((entry) => `| ${entry.field} | ${entry.value} | ${entry.sources}${entry.status === 'conflict' ? ' ⚠️ conflito' : ''} |`)
        .join('\n')}

Jogadores online gravados: ${profile.minOnlinePlayers ?? '—'}–${profile.maxOnlinePlayers ?? '—'} ·
Sessão: ${profile.minSessionMinutes ?? '—'}–${profile.maxSessionMinutes ?? '—'} min ·
Instalação: ${profile.installSizeMb ?? '—'} MB ·
Modelo: ${profile.freeToPlay ? 'gratuito' : 'pago'}

## Fontes consultadas

${sourceLinks}

## Histórico de auto-revisão

${dossier.critiqueHistory.map((critique, round) => critique.approved
        ? `**Rodada ${round + 1}:** aprovado.`
        : `**Rodada ${round + 1}:** ${critique.issues.map((issue) => `\n- ${issue}`).join('')}`).join('\n\n')}
`;
}

function auditHeader(): string {
    return `# Auditoria de pesquisa — Steam · Avaliações Steam · PCGamingWiki · Wikidata · catálogo interno

Cada campo mostra o valor adotado, as fontes e o status da checagem cruzada.

- \`✓ concordam\` — mais de uma fonte deu o mesmo valor.
- \`⚠ CONFLITO\` — as fontes divergiram; o script escolheu por precedência e registrou o motivo.
- \`· fonte única\` — só uma fonte tinha o dado.
- \`· indisponível\` — nenhuma fonte tinha o dado; o campo ficou nulo em vez de ser inventado.
- \`✦ julgamento do modelo\` — opinião da IA local, **não verificada**.

`;
}

function renderAuditEntry(game: CatalogGame, evidence: Evidence, audit: FieldAudit[]): string {
    const marker = (status: FieldAudit['status']): string => ({
        agree: '✓ concordam',
        conflict: '⚠ CONFLITO',
        'single-source': '· fonte única',
        unavailable: '· indisponível',
        'ai-judgement': '✦ julgamento do modelo',
    })[status];

    return [
        `## ${game.title} (id ${game.id})`,
        `Steam: ${evidence.steam.url}`,
        `PCGamingWiki: ${evidence.multiplayer?.url ?? 'não encontrado'}`,
        `Wikidata: ${evidence.wikidata?.url ?? 'não encontrado'}`,
        ...audit.map((entry) => `- **${entry.field}**: ${entry.value} [${marker(entry.status)} · ${entry.sources}]${entry.note ? ` — ${entry.note}` : ''}`),
        '',
        '',
    ].join('\n');
}

function toImportPayload(games: DecisionDataGameImport[]): { schemaVersion: 1; games: DecisionDataGameImport[] } {
    return { schemaVersion: 1, games };
}

function extractSteamAppId(url: string | null | undefined): string | null {
    return url?.match(STEAM_APP_ID_PATTERN)?.[1] ?? null;
}

function stripCoopSuffix(title: string): string {
    return title.replace(/\s*[-(]?\s*(Co-?op|Coop)\)?\s*$/i, '').trim();
}

function parseSessionMinutes(session: string): { min: number; max: number } | null {
    const range = session.match(/^(\d+)-(\d+)(min|h)$/);
    if (range?.[1] && range[2] && range[3]) {
        const factor = range[3] === 'h' ? 60 : 1;
        return { min: Number(range[1]) * factor, max: Number(range[2]) * factor };
    }
    const single = session.match(/^(\d+)(min|h)$/);
    if (single?.[1] && single[2]) {
        const minutes = Number(single[1]) * (single[2] === 'h' ? 60 : 1);
        return { min: minutes, max: minutes };
    }
    return null;
}

function slugify(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function log(message: string): void {
    process.stdout.write(`${message}\n`);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : 'Unknown error'}\n`);
    process.exitCode = 1;
});
