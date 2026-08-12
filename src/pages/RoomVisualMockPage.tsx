import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import {
    ArrowRight,
    Check,
    CircleDot,
    Gamepad2,
    Globe,
    Monitor,
    Play,
    Smartphone,
    Trophy,
} from 'lucide-react';
import { RoomRoster } from '@/components/room/RoomRoster';
import { RoomShell } from '@/components/room/RoomShell';
import { StepRail } from '@/components/room/StepRail';
import { roomCabinet, roomCabinetAmber, roomCard, roomChoiceIdle, roomChoiceSelected, roomMarqueeAmber } from '@/components/room/roomStyles';
import type { ParticipantPublicSnapshot } from '@shared/index';

/**
 * Local-only visual fixture. Remove this file and its route in App.tsx to
 * remove the fixture from the project; it is never available in production.
 */

type MockState = 'LOBBY' | 'MATCHING' | 'SHORTLIST' | 'COMPLETED';
type MockFamily = 'PC' | 'PLAYSTATION' | 'XBOX' | 'MOBILE' | 'BROWSER' | 'NINTENDO';

const mockParticipants: ParticipantPublicSnapshot[] = [
    {
        id: 'mock-host',
        nickname: 'Bia',
        role: 'HOST',
        status: 'READY',
        platforms: ['PC_STEAM'],
        subscriptions: ['XBOX_GAME_PASS_ULTIMATE'],
        ownedGames: [],
        pcTier: 'MID',
        preferences: {
            communication: 7,
            skill: 5,
            chaos: 6,
            strategy: 8,
            story: 7,
            difficultyTarget: null,
        },
        joinedAt: '2026-08-12T10:00:00.000Z',
        updatedAt: '2026-08-12T10:10:00.000Z',
    },
    {
        id: 'mock-member-one',
        nickname: 'Rafa',
        role: 'MEMBER',
        status: 'CONFIGURING',
        platforms: ['PS5'],
        subscriptions: [],
        ownedGames: [],
        pcTier: null,
        preferences: {
            communication: 5,
            skill: 6,
            chaos: 4,
            strategy: 6,
            story: 8,
            difficultyTarget: null,
        },
        joinedAt: '2026-08-12T10:02:00.000Z',
        updatedAt: '2026-08-12T10:12:00.000Z',
    },
];

const familyOptions: Array<{
    id: MockFamily;
    label: string;
    icon: typeof Monitor;
    variants: string[];
}> = [
    { id: 'PC', label: 'PC', icon: Monitor, variants: ['PC (Steam)', 'PC (Microsoft Store)', 'PC (Epic)'] },
    { id: 'PLAYSTATION', label: 'PlayStation', icon: Gamepad2, variants: ['PlayStation 4', 'PlayStation 5'] },
    { id: 'XBOX', label: 'Xbox', icon: Gamepad2, variants: ['Xbox One', 'Xbox Series X|S'] },
    { id: 'MOBILE', label: 'Celular', icon: Smartphone, variants: ['Android', 'iPhone/iPad'] },
    { id: 'BROWSER', label: 'Navegador', icon: Globe, variants: ['Navegador'] },
    { id: 'NINTENDO', label: 'Nintendo', icon: Gamepad2, variants: ['Nintendo Switch'] },
];

const mockSteps = [
    'Plataformas',
    'Assinaturas',
    'Nível do PC',
    'Preferências',
    'Jogos que possuo',
    'Histórico',
    'Revisão',
];

const mockGames = [
    { title: 'It Takes Two', score: 96, tone: 'PERFECT' },
    { title: 'Overcooked! 2', score: 91, tone: 'STRONG' },
    { title: 'Deep Rock Galactic', score: 87, tone: 'STRONG' },
];

const simulationEvents = [
    { label: 'Rafa entra na sala', detail: 'Convite aceito · perfil carregando' },
    { label: 'Rafa confirma o setup', detail: 'PlayStation 5 · pronto' },
    { label: 'A sala abre a votação', detail: 'Preferências congeladas para os dois' },
    { label: 'Rafa vota SIM', detail: 'It Takes Two · match perfeito' },
    { label: 'Bia vota SIM', detail: 'O match aparece para o grupo' },
    { label: 'Escolha registrada', detail: 'Resultado sincronizado' },
];

type SimulationStep = 0 | 1 | 2 | 3 | 4 | 5;

export function RoomVisualMockPage() {
    const [state, setState] = useState<MockState>('LOBBY');
    const [activeFamily, setActiveFamily] = useState<MockFamily>('PLAYSTATION');
    const [selectedVariant, setSelectedVariant] = useState('PlayStation 5');
    const [simulationStep, setSimulationStep] = useState<SimulationStep>(0);
    const [simulationRun, setSimulationRun] = useState(0);
    const [simulationRunning, setSimulationRunning] = useState(false);
    const selectedFamily = familyOptions.find((family) => family.id === activeFamily)!;
    const liveParticipants = mockParticipants.map((participant) => (
        participant.id === 'mock-member-one' && (simulationStep > 0 || state !== 'LOBBY')
            ? { ...participant, status: 'READY' as const }
            : participant
    ));
    const readyCount = liveParticipants.filter((participant) => participant.status === 'READY').length;

    useEffect(() => {
        if (!simulationRunning || simulationRun === 0) return undefined;

        const timers = [
            window.setTimeout(() => setSimulationStep(1), 650),
            window.setTimeout(() => {
                setSimulationStep(2);
                setState('MATCHING');
            }, 1_400),
            window.setTimeout(() => setSimulationStep(3), 2_600),
            window.setTimeout(() => {
                setSimulationStep(4);
                setState('SHORTLIST');
            }, 3_800),
            window.setTimeout(() => {
                setSimulationStep(5);
                setState('COMPLETED');
                setSimulationRunning(false);
            }, 5_200),
        ];

        return () => timers.forEach((timer) => window.clearTimeout(timer));
    }, [simulationRun, simulationRunning]);

    const startSimulation = () => {
        setState('LOBBY');
        setSimulationStep(0);
        setSimulationRunning(true);
        setSimulationRun((run) => run + 1);
    };

    const showState = (nextState: MockState) => {
        setSimulationRunning(false);
        setState(nextState);
        setSimulationStep(nextState === 'LOBBY' ? 0 : nextState === 'MATCHING' ? 2 : nextState === 'SHORTLIST' ? 4 : 5);
    };

    const showMatching = () => {
        setSimulationRunning(false);
        setSimulationStep(2);
        setState('MATCHING');
    };

    const currentEvent = simulationEvents[simulationStep];

    return (
        <MotionConfig reducedMotion="never">
            <RoomShell className="room-experience-shell room-mock-page">
            <header className={`${roomCabinetAmber} room-session-header`}>
                <div className="room-session-header__layout">
                    <div className="room-session-identity min-w-0">
                        <span className="room-kicker inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-100">
                            <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
                            Sala de demonstração
                        </span>
                        <h1 className="room-code room-session-code text-stone-100">MOCK42</h1>
                        <p className="room-session-meta flex flex-wrap items-center text-sm" aria-live="polite">
                            <span className="room-status-token border border-amber-500/40 font-medium text-amber-400">
                                {state === 'LOBBY' ? 'Configuração' : state === 'MATCHING' ? 'Votação' : state === 'COMPLETED' ? 'Concluída' : 'Finalistas'}
                            </span>
                            <span className="room-status-token bg-stone-800 font-medium text-stone-300">{liveParticipants.length} na sala</span>
                            <span className="room-status-token bg-stone-800 font-medium text-stone-300">{readyCount}/{liveParticipants.length} prontos</span>
                        </p>
                    </div>
                    <div className="room-session-actions room-mock-header-actions">
                        <p className="room-session-invite-title text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Fixture local</p>
                        <div className="flex flex-wrap gap-2">
                            <motion.span className="room-mock-live-token" animate={simulationRunning ? { opacity: [0.55, 1, 0.55] } : { opacity: 1 }} transition={simulationRunning ? { duration: 1.2, repeat: Infinity } : undefined}>
                                <CircleDot className="h-3.5 w-3.5" aria-hidden="true" /> {simulationRunning ? 'Ao vivo' : 'Sem API'}
                            </motion.span>
                        </div>
                    </div>
                </div>
            </header>

            <div className="room-mock-content">
                <nav className="room-mock-switcher" aria-label="Estados do mock visual">
                    <span className="room-mock-switcher__label">Visual / estados</span>
                    <div className="room-mock-switcher__buttons">
                        {(['LOBBY', 'MATCHING', 'SHORTLIST', 'COMPLETED'] as const).map((option) => (
                            <button
                                key={option}
                                type="button"
                                className={state === option ? 'room-mock-switch room-mock-switch--active' : 'room-mock-switch'}
                                onClick={() => showState(option)}
                            >
                                {option === 'LOBBY' ? 'Lobby' : option === 'MATCHING' ? 'Votação' : option === 'SHORTLIST' ? 'Finalistas' : 'Concluída'}
                            </button>
                        ))}
                    </div>
                    <motion.button
                        type="button"
                        className="room-mock-run"
                        onClick={startSimulation}
                        disabled={simulationRunning}
                        whileTap={{ scale: 0.96 }}
                    >
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        {simulationRunning ? 'Simulando…' : 'Simular sessão'}
                    </motion.button>
                </nav>

                <div className="room-mock-simulationbar" role="status" aria-live="polite">
                    <div className="room-mock-simulationbar__copy">
                        <span className="room-mock-simulationbar__eyebrow">Sessão local · Bia + Rafa</span>
                        <span>{currentEvent.label} · {currentEvent.detail}</span>
                    </div>
                    <div className="room-mock-simulationbar__progress" aria-hidden="true">
                        <motion.div animate={{ width: `${((simulationStep + 1) / simulationEvents.length) * 100}%` }} transition={{ duration: 0.45, ease: 'easeOut' }} />
                    </div>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={state}
                        className="room-mock-state"
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                    >
                        {state === 'LOBBY' ? (
                            <MockLobby
                                activeFamily={activeFamily}
                                selectedFamily={selectedFamily}
                                selectedVariant={selectedVariant}
                                participants={liveParticipants}
                                readyCount={readyCount}
                                onFamilyChange={setActiveFamily}
                                onVariantChange={setSelectedVariant}
                                onContinue={showMatching}
                            />
                        ) : state === 'MATCHING' ? (
                            <MockMatching simulationStep={simulationStep} />
                        ) : (
                            <MockShortlist completed={state === 'COMPLETED'} />
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </RoomShell>
        </MotionConfig>
    );
}

function MockLobby({
    activeFamily,
    selectedFamily,
    selectedVariant,
    participants,
    readyCount,
    onFamilyChange,
    onVariantChange,
    onContinue,
}: {
    activeFamily: MockFamily;
    selectedFamily: (typeof familyOptions)[number];
    selectedVariant: string;
    participants: ParticipantPublicSnapshot[];
    readyCount: number;
    onFamilyChange: (family: MockFamily) => void;
    onVariantChange: (variant: string) => void;
    onContinue: () => void;
}) {
    return (
        <div className="room-lobby-layout mt-3 grid items-start">
            <section className={`${roomCabinetAmber} room-workbench min-w-0`} aria-labelledby="mock-setup-title">
                <div className={roomMarqueeAmber}>
                    <h2 id="mock-setup-title" className="text-xl font-bold text-stone-100">Meu setup</h2>
                    <span className="font-mono text-sm text-stone-400">Etapa 1 de 7</span>
                </div>
                <div className="room-workbench__body p-5 sm:p-7">
                    <StepRail
                        className="room-workbench__rail"
                        items={mockSteps.map((label, index) => ({ id: String(index), label }))}
                        activeIndex={0}
                        navLabel="Sequência de configuração"
                        progressLabel="Progresso do mock"
                        onSelect={() => undefined}
                    />
                    <div className="room-workbench__question room-step-enter">
                        <h3 className="text-2xl font-bold leading-tight text-stone-100 sm:text-3xl">Qual é a sua plataforma?</h3>
                        <p className="mt-3 max-w-2xl text-stone-400">Escolha uma categoria; as opções aparecem em seguida. Você pode marcar mais de uma.</p>
                        <div className="mt-7 platform-cascade">
                            <div className="platform-cascade__families" role="group" aria-label="Famílias de plataforma">
                                {familyOptions.map((family, index) => {
                                    const Icon = family.icon;
                                    return (
                                        <button
                                            key={family.id}
                                            type="button"
                                            className="platform-family"
                                            data-active={activeFamily === family.id ? 'true' : 'false'}
                                            data-selected={selectedVariant && activeFamily === family.id ? 'true' : 'false'}
                                            aria-label={family.label}
                                            aria-pressed={activeFamily === family.id}
                                            onClick={() => onFamilyChange(family.id)}
                                        >
                                            <span className="platform-family__index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                                            <span className="platform-family__icon" aria-hidden="true"><Icon className="h-4 w-4" /></span>
                                            <span className="platform-family__label">{family.label}</span>
                                            <span className="platform-family__status" aria-hidden="true"><ArrowRight className="h-4 w-4" /></span>
                                        </button>
                                    );
                                })}
                            </div>
                            <section className="platform-cascade__variants room-step-enter" aria-labelledby="mock-variant-title">
                                <div className="platform-cascade__variant-heading">
                                    <span className="platform-cascade__connector" aria-hidden="true" />
                                    <p id="mock-variant-title">Opções de {selectedFamily.label}</p>
                                </div>
                                <fieldset>
                                    <legend className="sr-only">Opções de {selectedFamily.label}</legend>
                                    <div className="platform-cascade__variant-grid">
                                        {selectedFamily.variants.map((variant) => (
                                            <label key={variant} className={variant === selectedVariant ? roomChoiceSelected : roomChoiceIdle}>
                                                <input
                                                    type="radio"
                                                    name="mock-platform-variant"
                                                    checked={variant === selectedVariant}
                                                    onChange={() => onVariantChange(variant)}
                                                    className="h-4 w-4 shrink-0 accent-amber-500"
                                                />
                                                <span className="min-w-0 flex-1 font-semibold text-stone-100">{variant}</span>
                                                {variant === selectedVariant ? <Check className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" /> : null}
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                            </section>
                        </div>
                    </div>
                    <div className="room-action-dock">
                        <div className="flex flex-wrap items-center gap-3">
                            <button type="button" className="inline-flex min-h-[3rem] items-center gap-2 px-4 py-2 text-sm text-stone-500" disabled>Voltar</button>
                            <span className="ml-auto" />
                            <button type="button" onClick={onContinue} className="inline-flex min-h-[3rem] items-center gap-2 bg-amber-500 px-5 py-2 font-semibold text-stone-950">Ver votação <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
                        </div>
                    </div>
                </div>
            </section>
            <aside className="room-support-column min-w-0">
                <RoomRoster participants={participants} currentParticipantId="mock-host" />
                <section className={`${roomCabinet} room-start-panel p-5`} aria-labelledby="mock-start-title">
                    <h2 id="mock-start-title" className="text-lg font-bold text-stone-100">Iniciar decisão</h2>
                    <p className="room-start-panel__description mt-2 text-sm text-stone-400">O perfil e as regras ficam congelados durante a votação.</p>
                    <button type="button" onClick={onContinue} className="mt-5 inline-flex min-h-[3rem] w-full items-center justify-center gap-2 bg-amber-500 px-5 py-2 font-semibold text-stone-950"><Play className="h-4 w-4" aria-hidden="true" /> Iniciar votação</button>
                    <p className="room-start-panel__status mt-3 text-sm text-stone-500">{readyCount}/2 prontos · a sessão começa quando os dois confirmarem.</p>
                </section>
            </aside>
        </div>
    );
}

function MockMatching({ simulationStep }: { simulationStep: SimulationStep }) {
    const rafaVoted = simulationStep >= 3;
    const biaVoted = simulationStep >= 4;
    const progress = simulationStep >= 4 ? '100%' : simulationStep >= 3 ? '82%' : '66%';

    return (
        <section className="room-matching-layout mt-3 grid items-start">
            <div className="room-matching-main min-w-0 space-y-4">
                <div className={`${roomCabinet} room-progress-console p-5 sm:p-6`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-stone-400">Rodada de votação</p>
                        <motion.p key={progress} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="font-mono text-sm text-stone-400">{biaVoted ? 'Match fechado' : '2 de 5 matches'}</motion.p>
                    </div>
                    <div className="room-meter mt-4"><motion.div className="room-meter__fill" animate={{ width: progress }} transition={{ duration: 0.6, ease: 'easeOut' }} /></div>
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.p key={simulationStep >= 4 ? 'done' : rafaVoted ? 'waiting-bia' : 'waiting-rafa'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="mt-3 text-sm text-stone-400">
                            {biaVoted ? 'Bia e Rafa escolheram · calculando o match do grupo' : rafaVoted ? 'Rafa votou SIM · agora é a vez de Bia' : 'Rafa está escolhendo · a sala continua ao vivo'}
                        </motion.p>
                    </AnimatePresence>
                </div>
                <motion.article layout className={`${roomCabinetAmber} room-match-card overflow-hidden`} initial={{ opacity: 0, scale: 0.98, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}>
                    <div className="room-match-card__media room-mock-media flex items-end p-6 sm:p-8" aria-hidden="true"><span>CO-OP / 02–04</span></div>
                    <div className="room-match-card__body p-5 sm:p-8">
                        <p className="text-sm font-medium text-amber-400">Compatibilidade verificada · score 96</p>
                        <h2 className="mt-2 text-3xl font-bold text-stone-100 sm:text-4xl">It Takes Two</h2>
                        <p className="mt-4 max-w-2xl text-stone-300">Uma aventura cooperativa feita para duas pessoas atravessarem cada fase juntas.</p>
                        <ul className="mt-5 flex flex-wrap gap-2 text-xs">
                            {['2–4 jogadores', 'Sessões médias', 'PlayStation 5', 'Já possui'].map((tag) => <li key={tag} className="rounded-full bg-stone-800 px-3 py-1 text-stone-300">{tag}</li>)}
                        </ul>
                        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Escolha seu voto">
                            <motion.button type="button" className="mock-vote mock-vote--no" whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }}>Não <span>N</span></motion.button>
                            <motion.button type="button" className="mock-vote mock-vote--maybe" whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }}>Talvez <span>M</span></motion.button>
                            <motion.button type="button" className={`mock-vote mock-vote--yes ${biaVoted ? 'mock-vote--confirmed' : ''}`} whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }}>Sim <span>Y</span></motion.button>
                        </div>
                        <p className="mt-4 text-center text-sm text-stone-500">Atalhos: N/←, M/↓, Y/→</p>
                        <div className="room-mock-voters" aria-live="polite">
                            <AnimatePresence initial={false}>
                                {rafaVoted ? <motion.span key="rafa-vote" className="room-mock-voter room-mock-voter--ready" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>Rafa · SIM</motion.span> : null}
                                {biaVoted ? <motion.span key="bia-vote" className="room-mock-voter room-mock-voter--ready" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>Bia · SIM</motion.span> : null}
                            </AnimatePresence>
                        </div>
                    </div>
                </motion.article>
            </div>
            <aside className={`${roomCabinet} room-match-ledger min-w-0 p-5 sm:p-6`}>
                <h2 className="text-lg font-bold text-stone-100">Matches do grupo</h2>
                <ul className="mt-4 space-y-2">
                    {mockGames.slice(0, 2).map((game) => (
                        <li key={game.title} className={`${roomCard} px-4 py-3`}>
                            <span className="block font-semibold text-stone-100">{game.title}</span>
                            <span className="text-sm text-amber-400">{game.tone === 'PERFECT' ? 'Match perfeito' : 'Match forte'}</span>
                        </li>
                    ))}
                </ul>
                <button type="button" className="mt-5 inline-flex min-h-[3rem] w-full items-center justify-center gap-2 bg-amber-500 px-5 py-2 font-semibold text-stone-950"><Trophy className="h-4 w-4" aria-hidden="true" /> Ver finalistas</button>
            </aside>
        </section>
    );
}

function MockShortlist({ completed }: { completed: boolean }) {
    const [selectedGame, setSelectedGame] = useState(mockGames[0].title);
    const selected = useMemo(() => mockGames.find((game) => game.title === selectedGame) ?? mockGames[0], [selectedGame]);

    return (
        <section className="room-shortlist mt-3 space-y-5">
            <div className={`${roomCabinetAmber} room-shortlist-intro p-6 sm:p-9`} role="status">
                <Trophy className="h-9 w-9 text-amber-400" aria-hidden="true" />
                <h2 className="mt-5 text-3xl font-bold text-stone-100 sm:text-4xl">{completed ? 'Jogo escolhido!' : 'Finalistas da sala'}</h2>
                <p className="mt-4 max-w-xl text-stone-300">{completed ? 'A decisão do grupo foi registrada e está sincronizada para todas as pessoas.' : 'Compare os matches e registre a escolha final do grupo.'}</p>
            </div>
            <div className="room-shortlist-layout grid items-start">
                <aside className={`${roomCabinet} room-shortlist-index min-w-0 p-4 sm:p-5`}>
                    <h3 className="px-1 text-lg font-bold text-stone-100">Matches</h3>
                    <ul className="mt-4 space-y-2">
                        {mockGames.map((game) => (
                            <li key={game.title}>
                                <button type="button" onClick={() => setSelectedGame(game.title)} aria-current={selected.title === game.title ? 'true' : undefined} className={selected.title === game.title ? roomChoiceSelected : roomChoiceIdle}>
                                    <span className="min-w-0 flex-1"><span className="block font-semibold text-stone-100">{game.title}</span><span className="text-xs text-amber-400">{game.score} pontos</span></span>
                                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </aside>
                <article className={`${roomCabinetAmber} room-finalist-card min-w-0 overflow-hidden`}>
                    <div className="room-mock-media room-finalist-card__media flex items-end p-6" aria-hidden="true"><span>{selected.score} / 100 · {selected.tone}</span></div>
                    <div className="p-5 sm:p-8">
                        <p className="text-sm font-medium text-amber-400">Match finalista</p>
                        <h3 className="mt-2 text-3xl font-bold text-stone-100">{selected.title}</h3>
                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                            <div className={`${roomCard} p-5`}><h4 className="font-bold text-stone-100">Por que é compatível</h4><p className="mt-3 text-sm text-stone-300">Boa sobreposição de plataforma, duração e energia para esta sessão.</p></div>
                            <div className={`${roomCard} p-5`}><h4 className="font-bold text-stone-100">Veredito</h4><p className="mt-3 text-sm text-stone-300">A escolha entrega cooperação imediata sem exigir preparação longa.</p></div>
                        </div>
                        <button type="button" className="mt-6 inline-flex min-h-[3rem] items-center justify-center gap-2 bg-amber-500 px-5 py-2 font-semibold text-stone-950" disabled={completed}><Trophy className="h-4 w-4" aria-hidden="true" /> {completed ? 'Escolhido pelo grupo' : `Escolher ${selected.title}`}</button>
                    </div>
                </article>
            </div>
        </section>
    );
}
