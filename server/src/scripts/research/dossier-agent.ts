/**
 * Local-LLM agent that turns collected evidence into a per-game dossier and the
 * subjective profile axes, then critiques its own output and revises until the
 * critique passes (or the round budget runs out). Every value it produces is a
 * judgement call, never a verified fact — callers must label it as such.
 */

export interface DossierDraft {
    communication: number;
    skill: number;
    chaos: number;
    strategy: number;
    story: number;
    difficultyCode: 'EASY' | 'MODERATE' | 'HARD' | 'BRUTAL';
    minPcTier: 'LOW' | 'MID' | 'HIGH';
    overview: string;
    groupDynamics: string;
    axisRationale: string;
    accessNotes: string;
    caveats: string;
}

export interface DossierCritique {
    approved: boolean;
    issues: string[];
}

export interface DossierResult {
    draft: DossierDraft;
    rounds: number;
    approved: boolean;
    critiqueHistory: DossierCritique[];
}

export interface AgentConfig {
    ollamaUrl: string;
    model: string;
    maxRounds: number;
    contextTokens: number;
    onProgress?: (message: string) => void;
}

const DIFFICULTY_CODES = ['EASY', 'MODERATE', 'HARD', 'BRUTAL'];
const PC_TIERS = ['LOW', 'MID', 'HIGH'];

const SECTION_MINIMUMS: { key: keyof DossierDraft; label: string; minChars: number }[] = [
    { key: 'overview', label: 'Visão geral', minChars: 260 },
    { key: 'groupDynamics', label: 'Dinâmica em grupo', minChars: 220 },
    { key: 'axisRationale', label: 'Justificativa dos eixos', minChars: 220 },
    { key: 'accessNotes', label: 'Acesso e requisitos', minChars: 90 },
    { key: 'caveats', label: 'Ressalvas', minChars: 50 },
];

/** Phrases that signal the model padded the text instead of describing this specific game. */
const FILLER_PATTERNS = [
    /este jogo é (muito )?(bom|divertido|interessante)\.?$/i,
    /\blorem ipsum\b/i,
    /não há informações suficientes para/i,
];

export async function buildDossier(
    evidenceText: string,
    gameTitle: string,
    config: AgentConfig
): Promise<DossierResult | null> {
    const critiqueHistory: DossierCritique[] = [];
    let draft = await runDraft(evidenceText, gameTitle, config);
    if (!draft) return null;

    for (let round = 1; round <= config.maxRounds; round += 1) {
        const localIssues = findLocalIssues(draft);
        const critique = localIssues.length > 0
            ? { approved: false, issues: localIssues }
            : await runCritique(evidenceText, gameTitle, draft, config)
                ?? { approved: true, issues: ['Revisor indisponível — aprovado por falta de crítica.'] };
        critiqueHistory.push(critique);

        if (critique.approved) {
            return { draft, rounds: round, approved: true, critiqueHistory };
        }
        config.onProgress?.(`revisão ${round}: ${critique.issues.length} problema(s) — corrigindo`);
        if (round === config.maxRounds) break;

        const revised = await runRevision(evidenceText, gameTitle, draft, critique, config, round);
        if (!revised) break;
        draft = revised;
    }

    return { draft, rounds: config.maxRounds, approved: false, critiqueHistory };
}

function findLocalIssues(draft: DossierDraft): string[] {
    const issues: string[] = [];
    for (const section of SECTION_MINIMUMS) {
        const value = String(draft[section.key] ?? '');
        if (value.trim().length < section.minChars) {
            issues.push(`A seção "${section.label}" está rasa (${value.trim().length} caracteres, mínimo ${section.minChars}). Desenvolva com detalhes concretos do jogo.`);
        }
        if (FILLER_PATTERNS.some((pattern) => pattern.test(value))) {
            issues.push(`A seção "${section.label}" contém texto genérico de preenchimento. Substitua por observações específicas deste jogo.`);
        }
    }
    return issues;
}

async function callOllama(
    config: AgentConfig,
    prompt: string,
    temperature: number
): Promise<Record<string, unknown> | null> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const response = await fetch(`${config.ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: config.model,
                    prompt,
                    stream: false,
                    format: 'json',
                    options: { temperature, num_ctx: config.contextTokens },
                }),
            });
            if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
            const payload = await response.json() as { response?: string };
            if (!payload.response) throw new Error('Empty Ollama response');
            return JSON.parse(payload.response) as Record<string, unknown>;
        } catch {
            if (attempt === 3) return null;
            await sleep(attempt * 5000);
        }
    }
    return null;
}

const OUTPUT_CONTRACT = `Responda SOMENTE com um JSON válido, sem markdown e sem texto fora do JSON, no formato:
{
  "communication": <inteiro 0-10>,
  "skill": <inteiro 0-10>,
  "chaos": <inteiro 0-10>,
  "strategy": <inteiro 0-10>,
  "story": <inteiro 0-10>,
  "difficultyCode": "EASY" | "MODERATE" | "HARD" | "BRUTAL",
  "minPcTier": "LOW" | "MID" | "HIGH",
  "overview": "<2 a 3 frases densas sobre o que o jogo é e como funciona na prática>",
  "groupDynamics": "<2 a 3 frases sobre como a experiência se comporta em grupo de amigos: o que gera conversa, atrito, risada ou frustração>",
  "axisRationale": "<2 a 3 frases justificando os números escolhidos, citando evidências concretas>",
  "accessNotes": "<1 a 2 frases sobre preço/modelo, tamanho de instalação e exigência de hardware>",
  "caveats": "<1 a 2 frases sobre o que ficou incerto, divergente entre fontes ou não verificável>"
}

Regras obrigatórias:
- Escreva em português do Brasil, tom informativo e específico.
- Baseie-se APENAS nas evidências fornecidas. Nunca invente modos de jogo, números ou fatos ausentes.
- Se uma evidência estiver ausente ou conflitante, diga isso em "caveats" em vez de inventar.
- Escalas: communication (0 = jogo silencioso, 10 = depende totalmente de falar), skill (0 = qualquer um joga, 10 = exige reflexo/técnica), chaos (0 = previsível e controlado, 10 = imprevisível e bagunçado), strategy (0 = nenhum planejamento, 10 = planejamento profundo), story (0 = sem narrativa, 10 = narrativa central).
- minPcTier: baseie-se NOS REQUISITOS MÍNIMOS informados pela Steam, não na fama do jogo:
  - LOW = roda em vídeo integrado ou placa antiga; até ~4 GB de RAM; típico de 2D, pixel art, puzzle e indies leves.
  - MID = exige placa dedicada de entrada/média (ex.: GTX 660/1050) e ~8 GB de RAM.
  - HIGH = exige placa dedicada recente e forte (ex.: GTX 1060/RTX) ou 16 GB+ de RAM; típico de mundo aberto e AAA moderno.
  Exemplos: Cuphead e Terraria são LOW (2D, requisitos baixíssimos); Left 4 Dead 2 é LOW/MID (motor antigo); Baldur's Gate 3 e Palworld são HIGH.

Âncoras de calibração (use como referência para manter a escala consistente entre jogos):
- Keep Talking and Nobody Explodes: communication 10, skill 2, story 0 (o jogo é literalmente falar; quase nenhuma narrativa).
- Left 4 Dead 2: communication 8, skill 7, chaos 9, strategy 5, story 2 (shooter cooperativo caótico; narrativa é só pano de fundo).
- Portal 2 (cooperativo): communication 9, skill 6, chaos 2, strategy 8, story 5 (puzzle previsível e planejado, com narrativa presente mas secundária).
- Baldur's Gate 3: communication 7, skill 6, chaos 5, strategy 9, story 10 (RPG narrativo profundo e tático).
- Terraria: communication 5, skill 6, chaos 5, strategy 6, story 2 (sandbox; narrativa quase ausente).
Atenção: story alto exige narrativa realmente central (campanha roteirizada, personagens, roteiro). Shooters, sandboxes, roguelikes e party games quase sempre têm story entre 0 e 3.`;

async function runDraft(
    evidenceText: string,
    gameTitle: string,
    config: AgentConfig
): Promise<DossierDraft | null> {
    const prompt = `Você é um analista de jogos que documenta títulos para um app que ajuda grupos de amigos a escolher o que jogar juntos.

Analise as evidências coletadas sobre "${gameTitle}" e produza a documentação estruturada do jogo.

=== EVIDÊNCIAS COLETADAS ===
${evidenceText}
=== FIM DAS EVIDÊNCIAS ===

${OUTPUT_CONTRACT}`;
    const raw = await callOllama(config, prompt, 0.55);
    return raw ? validateDraft(raw) : null;
}

async function runCritique(
    evidenceText: string,
    gameTitle: string,
    draft: DossierDraft,
    config: AgentConfig
): Promise<DossierCritique | null> {
    const prompt = `Você é um revisor crítico e rigoroso. Avalie a documentação abaixo sobre o jogo "${gameTitle}" comparando-a com as evidências originais.

=== EVIDÊNCIAS ORIGINAIS ===
${evidenceText}
=== FIM DAS EVIDÊNCIAS ===

=== DOCUMENTAÇÃO A REVISAR ===
${JSON.stringify(draft, null, 2)}
=== FIM DA DOCUMENTAÇÃO ===

Verifique rigorosamente:
1. Algum fato citado NÃO aparece nas evidências (invenção/alucinação)?
2. Algum número de eixo contradiz as evidências (ex.: jogo sem multiplayer com communication alto, jogo casual com skill 10)?
3. O texto é específico deste jogo ou é genérico e poderia servir para qualquer outro?
4. As ressalvas mencionam de fato as lacunas e divergências presentes nas evidências?
5. Há contradição interna entre as seções?

Responda SOMENTE com JSON válido:
{"approved": <true se está correto e específico, false se precisa corrigir>, "issues": ["<problema concreto e acionável>", ...]}

Seja exigente, mas aprove se estiver factualmente correto e específico. Se aprovar, "issues" deve ser [].`;
    const raw = await callOllama(config, prompt, 0.2);
    if (!raw) return null;
    const approved = raw.approved === true;
    const issues = Array.isArray(raw.issues)
        ? raw.issues.filter((issue): issue is string => typeof issue === 'string' && issue.trim().length > 0)
        : [];
    return { approved: approved && issues.length === 0, issues };
}

async function runRevision(
    evidenceText: string,
    gameTitle: string,
    draft: DossierDraft,
    critique: DossierCritique,
    config: AgentConfig,
    round: number
): Promise<DossierDraft | null> {
    const prompt = `Você é um analista de jogos revisando o próprio trabalho sobre "${gameTitle}".

=== EVIDÊNCIAS COLETADAS ===
${evidenceText}
=== FIM DAS EVIDÊNCIAS ===

=== SUA VERSÃO ANTERIOR ===
${JSON.stringify(draft, null, 2)}
=== FIM DA VERSÃO ANTERIOR ===

=== PROBLEMAS APONTADOS PELO REVISOR ===
${critique.issues.map((issue, index) => `${index + 1}. ${issue}`).join('\n')}
=== FIM DOS PROBLEMAS ===

Corrija TODOS os problemas apontados, preservando o que já estava correto.
Reescreva as seções problemáticas com palavras diferentes — repetir o texto anterior mantém o problema.

${OUTPUT_CONTRACT}`;
    // Each retry gets a hotter sample: at a fixed temperature the model tends to
    // regenerate a near-identical draft and stall on the same critique forever.
    const raw = await callOllama(config, prompt, Math.min(0.45 + (round - 1) * 0.15, 0.8));
    return raw ? validateDraft(raw) : null;
}

function validateDraft(raw: Record<string, unknown>): DossierDraft | null {
    const axes = ['communication', 'skill', 'chaos', 'strategy', 'story'] as const;
    const values: Partial<Record<typeof axes[number], number>> = {};
    for (const axis of axes) {
        const value = normalizeAxis(raw[axis]);
        if (value === null) return null;
        values[axis] = value;
    }
    const difficultyCode = String(raw.difficultyCode ?? '').toUpperCase();
    const minPcTier = String(raw.minPcTier ?? '').toUpperCase();
    if (!DIFFICULTY_CODES.includes(difficultyCode) || !PC_TIERS.includes(minPcTier)) return null;

    const text = (key: string): string => typeof raw[key] === 'string' ? (raw[key] as string).trim() : '';
    const overview = text('overview');
    const groupDynamics = text('groupDynamics');
    const axisRationale = text('axisRationale');
    if (!overview || !groupDynamics || !axisRationale) return null;

    return {
        communication: values.communication!,
        skill: values.skill!,
        chaos: values.chaos!,
        strategy: values.strategy!,
        story: values.story!,
        difficultyCode: difficultyCode as DossierDraft['difficultyCode'],
        minPcTier: minPcTier as DossierDraft['minPcTier'],
        overview,
        groupDynamics,
        axisRationale,
        accessNotes: text('accessNotes'),
        caveats: text('caveats'),
    };
}

function normalizeAxis(value: unknown): number | null {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return null;
    const rounded = Math.round(parsed);
    return rounded >= 0 && rounded <= 10 ? rounded : null;
}

export async function checkOllamaModel(config: AgentConfig): Promise<boolean> {
    try {
        const response = await fetch(`${config.ollamaUrl}/api/tags`);
        if (!response.ok) return false;
        const payload = await response.json() as { models?: { name?: string }[] };
        return (payload.models ?? []).some((entry) => entry.name === config.model);
    } catch {
        return false;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
