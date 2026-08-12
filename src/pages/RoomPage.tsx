import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
    Check,
    Copy,
    ExternalLink,
    Loader2,
    PartyPopper,
    Play,
    Share2,
    ThumbsDown,
    ThumbsUp,
    Trophy,
    Users,
} from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type {
    ParticipantPublicSnapshot,
    PlatformReference,
    RoomMatch,
    RoomPublicSnapshot,
    VoteValue,
} from '@shared/index';
import { roomKeys, useRoom, useRoomRealtime, useRoomReferences } from '@/features/rooms/roomQueries';
import { YouTubePlayer } from '@/components/game/YouTubePlayer';
import { RadarChart } from '@/components/game/RadarChart';
import { MediaFrameSkeleton } from '@/components/ui/loading/MediaFrameSkeleton';
import { useGameplayVideo } from '@/hooks/useGameplayVideo';
import { RoomNotice, RoomShell } from '@/components/room/RoomShell';
import { RoomRoster } from '@/components/room/RoomRoster';
import { MutationError } from '@/components/room/MutationError';
import { SetupSequence } from '@/components/room/SetupSequence';
import { activeParticipants } from '@/components/room/roomSelectors';
import { withRoomVersion } from '@/features/rooms/roomVersionRetry';
import { roomCabinet, roomCabinetAmber, roomCard, roomChoiceIdle, roomChoiceSelected, roomMarqueeAmber, roomMeter } from '@/components/room/roomStyles';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import {
    completeRoom,
    getFinalistDetails,
    getMatches,
    getNextCard,
    joinRoom,
    openShortlist,
    RoomApiError,
    startRoom,
    submitVote,
} from '@/services/roomApi';

type RoomLocationState = { shareUrl?: string } | null;

export function RoomPage() {
    const { t } = useTranslation();
    const { code = '' } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const roomQuery = useRoom(code);
    const inviteToken = useMemo(() => new URLSearchParams(location.search).get('invite'), [location.search]);
    const shareUrl = (location.state as RoomLocationState)?.shareUrl;
    useRoomRealtime(code, roomQuery.isSuccess, roomQuery.data?.version);

    if (!code || !/^[A-Za-z0-9]{4,12}$/.test(code)) {
        return (
            <RoomNotice
                tone="error"
                role="alert"
                title={t('room.message.invalidCodeTitle')}
                detail={t('room.message.invalidCodeDetail')}
            />
        );
    }
    if (roomQuery.isPending) {
        return <RoomNotice title={t('room.message.loadingTitle')} detail={t('room.message.loadingDetail')} />;
    }
    if (roomQuery.error) {
        const canJoin = inviteToken && roomQuery.error instanceof RoomApiError
            && [401, 404].includes(roomQuery.error.status);
        if (canJoin) {
            return (
                <JoinRoomForm
                    code={code}
                    inviteToken={inviteToken}
                    onJoined={() => navigate(`/r/${code.toUpperCase()}`, { replace: true })}
                />
            );
        }
        return (
            <RoomNotice
                tone="error"
                role="alert"
                title={t('room.message.unavailableTitle')}
                detail={t('room.message.loadError')}
            />
        );
    }

    return <RoomExperience room={roomQuery.data} shareUrl={shareUrl} />;
}

function JoinRoomForm({
    code,
    inviteToken,
    onJoined,
}: {
    code: string;
    inviteToken: string;
    onJoined: () => void;
}) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [nickname, setNickname] = useState('');
    const mutation = useMutation({
        mutationFn: () => joinRoom(code, nickname, inviteToken),
        onSuccess: ({ room }) => {
            queryClient.setQueryData(roomKeys.detail(code), room);
            window.history.replaceState(window.history.state, '', `/r/${code.toUpperCase()}`);
            onJoined();
        },
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (nickname.trim().length >= 2) {
            mutation.mutate();
        }
    };

    return (
        <RoomShell width="narrow" centered>
            <section className={`${roomCabinetAmber} mx-auto max-w-xl`}>
                <div className={roomMarqueeAmber}>
                    <span className="flex items-center gap-2 text-sm font-semibold text-stone-400">
                        <Users className="h-4 w-4" aria-hidden="true" />
                        {t('room.header.eyebrow')}
                    </span>
                </div>
                <div className="p-6 sm:p-8">
                <h1 className="text-2xl font-bold text-stone-100 sm:text-3xl">
                    {t('room.join.title', { code: code.toUpperCase() })}
                </h1>
                <p className="mt-3 text-stone-400">{t('room.join.description')}</p>

                <form onSubmit={submit} className="mt-8" noValidate>
                    <label htmlFor="join-nickname" className="mb-2 block text-sm font-semibold text-stone-400">
                        {t('room.join.nicknameLabel')}
                    </label>
                    <input
                        id="join-nickname"
                        value={nickname}
                        onChange={(event) => setNickname(event.target.value)}
                        minLength={2}
                        maxLength={32}
                        required
                        autoComplete="nickname"
                        className="w-full rounded-xl border border-stone-700 bg-stone-900 px-4 py-3.5 text-stone-100 focus:border-amber-500 focus:outline-none"
                    />
                    {mutation.error ? <MutationError error={mutation.error} /> : null}
                    <Button
                        type="submit"
                        size="lg"
                        className="mt-5 w-full"
                        isLoading={mutation.isPending}
                        disabled={mutation.isPending || nickname.trim().length < 2}
                    >
                        {mutation.isPending ? t('room.join.pending') : t('room.join.submit')}
                    </Button>
                </form>
                </div>
            </section>
        </RoomShell>
    );
}

function RoomExperience({ room, shareUrl }: { room: RoomPublicSnapshot; shareUrl?: string }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const references = useRoomReferences(room.regionCode);
    const currentParticipant = room.participants.find((participant) => participant.id === room.currentParticipantId);

    const updateSnapshot = (snapshot: RoomPublicSnapshot) => {
        queryClient.setQueryData(roomKeys.detail(room.code), snapshot);
    };

    if (!currentParticipant) {
        return (
            <RoomNotice
                tone="error"
                role="alert"
                title={t('room.message.participantMissingTitle')}
                detail={t('room.message.participantMissingDetail')}
            />
        );
    }

    return (
        <RoomShell className="room-experience-shell">
            <RoomHeader room={room} participant={currentParticipant} shareUrl={shareUrl} />

            {room.status === 'LOBBY' ? (
                <div className="room-lobby-layout mt-5 grid items-start">
                    <SetupSequence
                        room={room}
                        participant={currentParticipant}
                        platforms={references.platforms.data ?? []}
                        plans={references.plans.data ?? []}
                        referencesPending={references.platforms.isPending}
                        referencesFailed={Boolean(references.platforms.error)}
                        onUpdated={updateSnapshot}
                    />
                    <aside className="room-support-column min-w-0">
                        <RoomRoster
                            participants={room.participants}
                            currentParticipantId={currentParticipant.id}
                        />
                        {currentParticipant.role === 'HOST' ? <StartRoomPanel room={room} /> : null}
                    </aside>
                </div>
            ) : room.status === 'MATCHING' ? (
                <MatchingExperience
                    room={room}
                    participant={currentParticipant}
                    platforms={references.platforms.data ?? []}
                />
            ) : room.status === 'SHORTLIST' || room.status === 'COMPLETED' ? (
                <ShortlistExperience
                    room={room}
                    participant={currentParticipant}
                    platforms={references.platforms.data ?? []}
                />
            ) : (
                <section className={`${roomCabinet} mt-8 p-10 text-center`} role="status">
                    <h2 className="text-2xl font-bold text-stone-100">{t('room.message.inProgressTitle')}</h2>
                    <p className="mt-3 text-stone-400">{t('room.message.inProgressDetail')}</p>
                </section>
            )}
        </RoomShell>
    );
}

function RoomHeader({
    room,
    participant,
    shareUrl,
}: {
    room: RoomPublicSnapshot;
    participant: ParticipantPublicSnapshot;
    shareUrl?: string;
}) {
    const { t } = useTranslation();
    const [copyStatus, setCopyStatus] = useState('');
    const people = activeParticipants(room.participants);
    const readyCount = people.filter((person) => person.status === 'READY').length;

    const copyInvite = async () => {
        if (!shareUrl) {
            setCopyStatus(t('room.header.copyUnavailable'));
            return;
        }
        await navigator.clipboard.writeText(shareUrl);
        setCopyStatus(t('room.header.copied'));
    };

    const shareInvite = async () => {
        if (!shareUrl || typeof navigator.share !== 'function') return;
        try {
            await navigator.share({
                title: t('room.header.shareTitle', { code: room.code }),
                text: t('room.header.shareText'),
                url: shareUrl,
            });
        } catch (error) {
            if (!(error instanceof DOMException) || error.name !== 'AbortError') {
                setCopyStatus(t('room.header.copyUnavailable'));
            }
        }
    };

    return (
        <header className={`${roomCabinetAmber} room-session-header`}>
            <div className="room-session-header__layout">
                <div className="room-session-identity min-w-0">
                    <span className="room-kicker inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-100">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
                        {t('room.header.eyebrow')}
                    </span>
                    <h1 className="room-code room-session-code text-stone-100">{room.code}</h1>
                    <p className="room-session-meta flex flex-wrap items-center text-sm" aria-live="polite">
                        <span className="room-status-token border border-amber-500/40 font-medium text-amber-400">
                            {t(`room.header.status.${room.status}`)}
                        </span>
                        <span className="room-status-token room-people-token bg-stone-800 font-medium text-stone-300">
                            {t('room.header.people', { total: people.length })}
                        </span>
                        <span className="room-status-token room-ready-token bg-stone-800 font-medium text-stone-300">
                            {t('room.lobby.readyCount', { ready: readyCount, total: people.length })}
                        </span>
                        <span className="room-session-version font-mono text-xs text-stone-500">
                            {t('room.header.version', { version: room.version })}
                        </span>
                    </p>
                </div>

                {participant.role === 'HOST' ? (
                    <div className="room-session-actions">
                        <p className="room-session-invite-title text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{t('room.header.inviteTitle')}</p>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="secondary"
                                aria-label={t('room.header.copyInvitation')}
                                onClick={() => void copyInvite()}
                            >
                                <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                                <span className="room-session-action-label">{t('room.header.copyInvitation')}</span>
                            </Button>
                            {shareUrl && typeof navigator.share === 'function' ? (
                                <Button
                                    variant="secondary"
                                    aria-label={t('room.header.shareInvitation')}
                                    onClick={() => void shareInvite()}
                                >
                                    <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                    <span className="room-session-action-label">{t('room.header.shareInvitation')}</span>
                                </Button>
                            ) : null}
                        </div>
                        <p className="room-session-copy-status min-h-5 text-sm text-stone-500" role="status">{copyStatus}</p>
                    </div>
                ) : null}
            </div>
        </header>
    );
}

function StartRoomPanel({ room }: { room: RoomPublicSnapshot }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const people = activeParticipants(room.participants);
    const readyCount = people.filter((participant) => participant.status === 'READY').length;
    const allReady = people.length >= 2
        && people.every((participant) => participant.status === 'READY' && participant.platforms.length > 0);
    const mutation = useMutation({
        mutationFn: () => withRoomVersion(room.version, (version) => startRoom(room.code, version)),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: roomKeys.detail(room.code) }),
    });

    return (
        <section className={`${roomCabinet} room-start-panel p-5 sm:p-6`} aria-labelledby="room-start-title">
            <h2 id="room-start-title" className="text-lg font-bold text-stone-100">{t('room.start.title')}</h2>
            <p className="room-start-panel__description mt-2 text-sm text-stone-400">{t('room.start.description')}</p>
            <Button
                size="lg"
                className="mt-5 w-full"
                isLoading={mutation.isPending}
                disabled={!allReady || mutation.isPending}
                onClick={() => mutation.mutate()}
            >
                {mutation.isPending ? null : <Play className="mr-2 h-4 w-4" aria-hidden="true" />}
                {mutation.isPending ? t('room.start.pending') : t('room.start.submit')}
            </Button>
            {!allReady ? (
                <p className="room-start-panel__status mt-3 text-sm text-stone-500" role="status">
                    {people.length < 2
                        ? t('room.start.needParticipants')
                        : t('room.start.waitingCount', { ready: readyCount, total: people.length })}
                </p>
            ) : null}
            {mutation.error ? <MutationError error={mutation.error} /> : null}
        </section>
    );
}

function MatchingExperience({
    room,
    participant,
    platforms,
}: {
    room: RoomPublicSnapshot;
    participant: ParticipantPublicSnapshot;
    platforms: PlatformReference[];
}) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const nextCard = useQuery({
        queryKey: roomKeys.nextCard(room.code),
        queryFn: () => getNextCard(room.code),
        staleTime: 0,
    });
    const matches = useQuery({
        queryKey: roomKeys.matches(room.code),
        queryFn: () => getMatches(room.code),
        staleTime: 0,
    });
    const [matchOverlay, setMatchOverlay] = useState<{ kind: 'PERFECT' | 'STRONG'; matchScore: number } | null>(null);
    const matchContinueButton = useRef<HTMLButtonElement>(null);
    const overlayReturnFocus = useRef<HTMLElement | null>(null);
    const matchesHeading = useRef<HTMLHeadingElement>(null);
    const announcedMatchIds = useRef(new Set<string>());
    const announceMatch = (match: Pick<RoomMatch, 'gameId' | 'kind' | 'matchScore'>) => {
        if (announcedMatchIds.current.has(match.gameId)) return;
        announcedMatchIds.current.add(match.gameId);
        overlayReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setMatchOverlay({ kind: match.kind, matchScore: match.matchScore });
    };
    const vote = useMutation({
        mutationFn: (value: VoteValue) => submitVote(room.code, nextCard.data!.card!.id, value),
        onSuccess: (result) => {
            if (result.match) {
                announceMatch({
                    gameId: nextCard.data!.card!.id,
                    kind: result.match.kind,
                    matchScore: result.match.matchScore,
                });
            }
            void queryClient.invalidateQueries({ queryKey: roomKeys.nextCard(room.code) });
            void queryClient.invalidateQueries({ queryKey: roomKeys.matches(room.code) });
            void queryClient.invalidateQueries({ queryKey: roomKeys.detail(room.code) });
        },
    });

    useEffect(() => {
        const match = matches.data?.matches.find((candidate) => !announcedMatchIds.current.has(candidate.gameId));
        if (match) announceMatch(match);
    }, [matches.data?.matches]);
    const shortlist = useMutation({
        mutationFn: () => withRoomVersion(room.version, (version) => openShortlist(room.code, version)),
        onSuccess: (snapshot) => {
            queryClient.setQueryData(roomKeys.detail(room.code), snapshot);
            void queryClient.invalidateQueries({ queryKey: roomKeys.matches(room.code) });
        },
    });
    const submit = (value: VoteValue) => {
        if (!vote.isPending && nextCard.data?.card) vote.mutate(value);
    };
    const closeMatchOverlay = () => {
        setMatchOverlay(null);
        window.requestAnimationFrame(() => {
            const target = overlayReturnFocus.current?.isConnected
                ? overlayReturnFocus.current
                : matchesHeading.current;
            target?.focus();
        });
    };

    useEffect(() => {
        if (matchOverlay) matchContinueButton.current?.focus();
    }, [matchOverlay]);

    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if (matchOverlay) {
                if (event.key === 'Escape') closeMatchOverlay();
                if (event.key === 'Tab') {
                    event.preventDefault();
                    matchContinueButton.current?.focus();
                }
                return;
            }
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
            if (event.key.toLowerCase() === 'n' || event.key === 'ArrowLeft') submit('NO');
            if (event.key.toLowerCase() === 'm' || event.key === 'ArrowDown') submit('MAYBE');
            if (event.key.toLowerCase() === 'y' || event.key === 'ArrowRight') submit('YES');
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    });

    if (nextCard.isPending) {
        return (
            <p className="mt-16 flex items-center justify-center gap-2 text-stone-400" role="status">
                <Loader2 className="loading-motion h-4 w-4 animate-spin" aria-hidden="true" />
                {t('room.matching.preparingCard')}
            </p>
        );
    }
    if (nextCard.error) {
        return <MutationError error={nextCard.error} />;
    }
    const card = nextCard.data.card;
    const progress = nextCard.data.progress;
    const votedShare = progress.voted + progress.remaining === 0
        ? 0
        : (progress.voted / (progress.voted + progress.remaining)) * 100;

    return (
        <section className="room-matching-layout mt-5 grid items-start">
            <div className="room-matching-main min-w-0 space-y-4">
                <div className={`${roomCabinet} room-progress-console p-5 sm:p-6`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-stone-400">{t('room.matching.eyebrow')}</p>
                        <p className="font-mono text-sm text-stone-400">
                            {t('room.matching.matchProgress', { matches: progress.matches, target: progress.target })}
                        </p>
                    </div>
                    <div className={`${roomMeter} mt-4`}>
                        <div className="room-meter__fill" style={{ width: `${votedShare}%` }} />
                    </div>
                    <p className="mt-3 text-sm text-stone-400" aria-live="polite">
                        {t('room.matching.progress', {
                            nickname: participant.nickname,
                            voted: progress.voted,
                            remaining: progress.remaining,
                        })}
                    </p>
                </div>

                {card ? (
                    <article className={`${roomCabinetAmber} room-match-card overflow-hidden`}>
                        {card.imageUrl ? (
                            <img src={card.imageUrl} alt="" className="room-match-card__media w-full object-cover" />
                        ) : null}
                        <div className="room-match-card__body p-5 sm:p-8">
                            <p className="text-sm font-medium text-amber-400">
                                {t('room.matching.verifiedScore', { score: Math.round(card.baseScore) })}
                            </p>
                            <h2 className="mt-2 text-3xl font-bold text-stone-100 sm:text-4xl">{card.title}</h2>
                            <p className="mt-4 text-stone-300">{card.summary}</p>

                            <ul className="mt-5 flex flex-wrap gap-2 text-xs">
                                <li className="rounded-full bg-stone-800 px-3 py-1 text-stone-300">
                                    {t('room.matching.players', { min: card.playerMin, max: card.playerMax })}
                                </li>
                                <li className="rounded-full bg-stone-800 px-3 py-1 text-stone-300">{card.session}</li>
                                <li className="rounded-full bg-stone-800 px-3 py-1 text-stone-300">{card.difficulty}</li>
                                {card.relevantPlatforms.map((platform) => (
                                    <li key={platform} className="rounded-full bg-stone-800 px-3 py-1 text-stone-300">
                                        {platformLabel(platform, platforms)}
                                    </li>
                                ))}
                                {card.accessKinds.map((access) => (
                                    <li key={access} className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300">
                                        {accessLabel(access, t)}
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label={t('room.matching.voteGroupLabel')}>
                                <VoteButton
                                    label={t('room.matching.voteNo')}
                                    shortcut="N"
                                    tone="no"
                                    onClick={() => submit('NO')}
                                    disabled={vote.isPending}
                                    icon={<ThumbsDown className="h-5 w-5" aria-hidden="true" />}
                                />
                                <VoteButton
                                    label={t('room.matching.voteMaybe')}
                                    shortcut="M"
                                    tone="maybe"
                                    onClick={() => submit('MAYBE')}
                                    disabled={vote.isPending}
                                />
                                <VoteButton
                                    label={t('room.matching.voteYes')}
                                    shortcut="Y"
                                    tone="yes"
                                    onClick={() => submit('YES')}
                                    disabled={vote.isPending}
                                    icon={<ThumbsUp className="h-5 w-5" aria-hidden="true" />}
                                />
                            </div>
                            <p className="mt-4 text-center text-sm text-stone-500">{t('room.matching.shortcuts')}</p>
                            {vote.error ? <MutationError error={vote.error} /> : null}
                        </div>
                    </article>
                ) : (
                    <div className={`${roomCabinet} p-10 text-center`}>
                        <Check className="mx-auto h-8 w-8 text-emerald-400" aria-hidden="true" />
                        <h2 className="mt-5 text-2xl font-bold text-stone-100">{t('room.matching.allCardsTitle')}</h2>
                        <p className="mx-auto mt-3 max-w-md text-stone-400">{t('room.matching.allCardsBody')}</p>
                    </div>
                )}

                {room.prefilterSummary ? (
                    <details className={`${roomCabinet} p-5`}>
                        <summary className="cursor-pointer font-semibold text-stone-200">
                            {t('room.matching.prefilter', {
                                total: room.prefilterSummary.totalConsidered,
                                eligible: room.prefilterSummary.eligible,
                            })}
                        </summary>
                        <ul className="mt-3 space-y-1 text-sm text-stone-400">
                            {Object.entries(room.prefilterSummary.rejectedByReason)
                                .filter(([, count]) => count > 0)
                                .map(([reason, count]) => (
                                    <li key={reason}>
                                        {t('room.matching.prefilterRemoved', {
                                            count,
                                            reason: t(`recommendation.rejection.${reason}`),
                                        })}
                                    </li>
                                ))}
                        </ul>
                    </details>
                ) : null}
            </div>

            <aside className={`${roomCabinet} room-match-ledger min-w-0 p-5 sm:p-6`}>
                <h2 ref={matchesHeading} tabIndex={-1} className="text-lg font-bold text-stone-100">
                    {t('room.matching.groupMatches')}
                </h2>
                {matches.data?.matches.length === 0 ? (
                    <p className="mt-4 rounded-xl border border-dashed border-stone-700 px-4 py-6 text-center text-sm text-stone-500">
                        {t('room.matching.none')}
                    </p>
                ) : (
                    <ul className="mt-4 space-y-2">
                        {(matches.data?.matches ?? []).map((match) => (
                            <li key={match.gameId} className={`${roomCard} px-4 py-3`}>
                                <span className="block font-semibold text-stone-100">{match.game.title}</span>
                                <span className="text-sm text-amber-400">
                                    {match.kind === 'PERFECT' ? t('room.matching.perfect') : t('room.matching.strong')}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
                {participant.role === 'HOST' && (matches.data?.matches.length ?? 0) > 0 ? (
                    <Button
                        size="lg"
                        className="mt-5 w-full"
                        isLoading={shortlist.isPending}
                        disabled={shortlist.isPending}
                        onClick={() => shortlist.mutate()}
                    >
                        {shortlist.isPending ? null : <Trophy className="mr-2 h-4 w-4" aria-hidden="true" />}
                        {shortlist.isPending ? t('room.matching.openingShortlist') : t('room.matching.openShortlist')}
                    </Button>
                ) : null}
                {shortlist.error ? <MutationError error={shortlist.error} /> : null}
            </aside>

            {matchOverlay ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/85 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="match-title"
                >
                    <div className={`${roomCabinetAmber} max-w-md p-8 text-center`} aria-live="assertive">
                        <PartyPopper className="mx-auto h-10 w-10 text-amber-400" aria-hidden="true" />
                        <h2 id="match-title" className="mt-5 text-3xl font-bold text-amber-400">
                            {matchOverlay.kind === 'PERFECT' ? t('room.matching.overlayPerfect') : t('room.matching.overlayStrong')}
                        </h2>
                        <p className="mt-3 text-stone-300">
                            {t('room.matching.overlayBody', { score: Math.round(matchOverlay.matchScore) })}
                        </p>
                        <button
                            ref={matchContinueButton}
                            type="button"
                            onClick={closeMatchOverlay}
                            className="mt-7 w-full rounded-lg bg-amber-500 px-6 py-3 font-semibold text-stone-950 transition-colors hover:bg-amber-400"
                        >
                            {t('room.matching.continue')}
                        </button>
                    </div>
                </div>
            ) : null}
        </section>
    );
}

function ShortlistExperience({
    room,
    participant,
    platforms,
}: {
    room: RoomPublicSnapshot;
    participant: ParticipantPublicSnapshot;
    platforms: PlatformReference[];
}) {
    const { t, i18n } = useTranslation();
    const queryClient = useQueryClient();
    const matches = useQuery({
        queryKey: roomKeys.matches(room.code),
        queryFn: () => getMatches(room.code),
        staleTime: 0,
    });
    const [selectedGameId, setSelectedGameId] = useState(room.decision?.gameId ?? '');

    useEffect(() => {
        if (room.decision?.gameId) {
            setSelectedGameId(room.decision.gameId);
            return;
        }
        if (!selectedGameId && matches.data?.matches[0]) {
            setSelectedGameId(matches.data.matches[0].gameId);
        }
    }, [matches.data?.matches, room.decision?.gameId, selectedGameId]);

    const details = useQuery({
        queryKey: roomKeys.finalist(room.code, selectedGameId),
        queryFn: () => getFinalistDetails(room.code, selectedGameId),
        enabled: selectedGameId.length > 0,
        staleTime: 30_000,
    });
    const decision = useMutation({
        mutationFn: () => withRoomVersion(
            room.version,
            (version) => completeRoom(room.code, selectedGameId, version)
        ),
        onSuccess: (snapshot) => {
            queryClient.setQueryData(roomKeys.detail(room.code), snapshot);
        },
    });

    if (matches.isPending) {
        return (
            <p className="mt-16 flex items-center justify-center gap-2 text-stone-400" role="status">
                <Loader2 className="loading-motion h-4 w-4 animate-spin" aria-hidden="true" />
                {t('room.shortlist.loading')}
            </p>
        );
    }
    if (matches.error) {
        return <MutationError error={matches.error} />;
    }

    const completed = room.status === 'COMPLETED';
    return (
        <section className="room-shortlist mt-5 space-y-5">
            <div className={`${roomCabinetAmber} room-shortlist-intro p-6 sm:p-9`} role="status" aria-live="polite">
                <Trophy className="mx-auto h-9 w-9 text-amber-400" aria-hidden="true" />
                <h2 className="mt-5 text-3xl font-bold text-stone-100 sm:text-4xl">
                    {completed ? t('room.shortlist.completedTitle') : t('room.shortlist.title')}
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-stone-300">
                    {completed
                        ? t('room.shortlist.completedBody')
                        : participant.role === 'HOST'
                            ? t('room.shortlist.hostBody')
                            : t('room.shortlist.memberBody')}
                </p>
                {completed ? (
                    <p className="mt-3 text-sm text-stone-500">
                        {t('room.shortlist.expiresAt', {
                            date: new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                            }).format(new Date(room.expiresAt)),
                        })}
                    </p>
                ) : null}
            </div>

            <div className="room-shortlist-layout grid items-start">
                <aside className={`${roomCabinet} room-shortlist-index min-w-0 p-4 sm:p-5`}>
                    <h3 className="px-1 text-lg font-bold text-stone-100">{t('room.shortlist.matches')}</h3>
                    <ul className="mt-4 space-y-2">
                        {matches.data.matches.map((match) => {
                            const chosen = room.decision?.gameId === match.gameId;
                            const selected = selectedGameId === match.gameId;
                            return (
                                <li key={match.gameId}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedGameId(match.gameId)}
                                        aria-current={selected ? 'true' : undefined}
                                        className={selected ? roomChoiceSelected : roomChoiceIdle}
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-semibold text-stone-100">{match.game.title}</span>
                                            <span className="block text-sm text-stone-400">
                                                {chosen ? t('room.shortlist.chosen') : ''}
                                                {match.kind === 'PERFECT' ? t('room.matching.perfect') : t('room.matching.strong')}
                                                {' · '}
                                                {t('room.shortlist.points', { score: Math.round(match.matchScore) })}
                                            </span>
                                        </span>
                                        {chosen ? (
                                            <Check className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                                        ) : null}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </aside>

                <div className="min-w-0" aria-live="polite">
                    {details.isPending ? (
                        <div className={`${roomCabinet} p-5 sm:p-6`}>
                            <MediaFrameSkeleton className="h-56" />
                            <p className="mt-4 text-stone-400" role="status">{t('room.shortlist.loadingDetails')}</p>
                        </div>
                    ) : details.error ? (
                        <MutationError error={details.error} />
                    ) : details.data ? (
                        <article className={`${roomCabinetAmber} room-finalist-card overflow-hidden`}>
                            {details.data.match.game.imageUrl ? (
                                <img
                                    src={details.data.match.game.imageUrl}
                                    alt=""
                                    className="aspect-[16/7] w-full object-cover"
                                />
                            ) : null}
                            <div className="space-y-8 p-5 sm:p-8">
                                <div>
                                    <p className="text-sm font-medium text-amber-400">
                                        {details.data.match.kind === 'PERFECT' ? t('room.matching.perfect') : t('room.matching.strong')}
                                        {' · '}
                                        {t('room.shortlist.points', { score: Math.round(details.data.match.matchScore) })}
                                    </p>
                                    <h3 className="mt-2 text-3xl font-bold text-stone-100 sm:text-4xl">{details.data.match.game.title}</h3>
                                    <p className="mt-4 text-stone-300">{details.data.description}</p>
                                    <ul className="mt-5 flex flex-wrap gap-2 text-xs">
                                        <li className="rounded-full bg-stone-800 px-3 py-1 text-stone-300">{t('room.shortlist.duration', { value: details.data.match.game.session })}</li>
                                        <li className="rounded-full bg-stone-800 px-3 py-1 text-stone-300">{t('room.shortlist.difficulty', { value: details.data.match.game.difficulty })}</li>
                                        <li className="rounded-full bg-stone-800 px-3 py-1 text-stone-300">
                                            {t('room.shortlist.players', {
                                                min: details.data.match.game.playerMin,
                                                max: details.data.match.game.playerMax,
                                            })}
                                        </li>
                                        <li className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300">
                                            {t('room.shortlist.knownSpend', {
                                                value: details.data.match.evaluation.groupSpendMinor !== null && details.data.match.evaluation.currency
                                                    ? formatMinorAmount(
                                                        details.data.match.evaluation.groupSpendMinor,
                                                        details.data.match.evaluation.currency,
                                                        i18n.resolvedLanguage || i18n.language
                                                    )
                                                    : t('room.shortlist.unavailable'),
                                            })}
                                        </li>
                                    </ul>
                                </div>

                                <FinalistGameplay
                                    gameId={details.data.match.gameId}
                                    title={details.data.match.game.title}
                                />

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className={`${roomCard} p-5`}>
                                        <h4 className="font-bold text-stone-100">{t('room.shortlist.radar')}</h4>
                                        <RadarChart stats={details.data.stats} />
                                    </div>
                                    <div className={`${roomCard} p-5`}>
                                        <h4 className="font-bold text-stone-100">{t('room.shortlist.whyCompatible')}</h4>
                                        <ul className="mt-4 space-y-3">
                                            {([
                                                ['preference', t('room.shortlist.dimensionPreference')],
                                                ['access', t('room.shortlist.dimensionAccess')],
                                                ['session', t('room.shortlist.dimensionSession')],
                                                ['price', t('room.shortlist.dimensionPrice')],
                                                ['novelty', t('room.shortlist.dimensionNovelty')],
                                            ] as const).map(([key, label]) => {
                                                const dimension = details.data.match.evaluation.scoreBreakdown[key];
                                                return (
                                                    <li key={key} className="flex items-center gap-3">
                                                        <span className="flex-1 text-sm text-stone-300">{label}</span>
                                                        <span className={`${roomMeter} w-24`}>
                                                            <span
                                                                className="room-meter__fill block"
                                                                style={{ width: `${(dimension.points / dimension.max) * 100}%` }}
                                                            />
                                                        </span>
                                                        <strong className="w-16 text-right font-mono text-sm text-amber-400">
                                                            {dimension.points.toFixed(1)}/{dimension.max}
                                                        </strong>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className={`${roomCard} p-5`}>
                                        <h4 className="font-bold text-stone-100">{t('room.shortlist.mechanic')}</h4>
                                        <p className="mt-3 text-sm text-stone-300">{details.data.mechanic}</p>
                                    </div>
                                    <div className={`${roomCard} p-5`}>
                                        <h4 className="font-bold text-stone-100">{t('room.shortlist.verdict')}</h4>
                                        <p className="mt-3 text-sm text-stone-300">{details.data.verdict}</p>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="font-bold text-stone-100">{t('room.shortlist.participantAccess')}</h4>
                                    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                                        {details.data.participantAccess.map((access) => (
                                            <li key={access.participantId} className={`${roomCard} p-4 text-sm`}>
                                                <strong className="block font-semibold text-stone-100">{access.nickname}</strong>
                                                <span className="mt-1 block text-stone-300">
                                                    {platformLabel(access.platformCode, platforms)} · {participantAccessLabel(access.accessKind, access.subscriptionPlanCode, t)}
                                                </span>
                                                {access.subscriptionPlanCode ? (
                                                    <span className="mt-1 block text-stone-400">{t('room.shortlist.plan', { plan: access.subscriptionPlanCode })}</span>
                                                ) : null}
                                                {access.amountMinor !== null && access.currency ? (
                                                    <span className="mt-1 block text-stone-400">
                                                        {t('room.shortlist.estimatedCost', {
                                                            value: formatMinorAmount(access.amountMinor, access.currency, i18n.resolvedLanguage || i18n.language),
                                                        })}
                                                    </span>
                                                ) : null}
                                                <span className="mt-1 block text-stone-500">
                                                    {t('room.shortlist.online', { value: onlineAccessLabel(access.onlineMultiplayer, t) })}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {details.data.match.evaluation.warnings.length > 0 ? (
                                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
                                        <div>
                                            <h4 className="font-bold text-amber-200">{t('room.shortlist.dataWarnings')}</h4>
                                            <ul className="mt-2 list-inside list-disc text-sm text-amber-100/80">
                                                {details.data.match.evaluation.warnings.map((warning) => (
                                                    <li key={warning}>{warningLabel(warning, t)}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                ) : null}

                                {details.data.tags.length > 0 ? (
                                    <ul className="flex flex-wrap gap-2">
                                        {details.data.tags.map((tag) => (
                                            <li key={tag} className="rounded-full bg-stone-800 px-3 py-1 text-xs text-stone-300">{tag}</li>
                                        ))}
                                    </ul>
                                ) : null}

                                <div className="flex flex-wrap items-center gap-3 border-t border-stone-800 pt-6">
                                    {details.data.storeUrl ? (
                                        <a
                                            href={details.data.storeUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-700 bg-stone-800 px-6 py-3 font-semibold text-stone-100 transition-colors hover:border-amber-500/50 hover:bg-stone-700"
                                        >
                                            {t('room.shortlist.store')}
                                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                        </a>
                                    ) : null}
                                    {!completed && participant.role === 'HOST' ? (
                                        <Button
                                            size="lg"
                                            isLoading={decision.isPending}
                                            disabled={decision.isPending}
                                            onClick={() => decision.mutate()}
                                        >
                                            {decision.isPending ? null : <Trophy className="mr-2 h-4 w-4" aria-hidden="true" />}
                                            {decision.isPending
                                                ? t('room.shortlist.registering')
                                                : t('room.shortlist.choose', { title: details.data.match.game.title })}
                                        </Button>
                                    ) : null}
                                </div>
                                {decision.error ? <MutationError error={decision.error} /> : null}
                            </div>
                        </article>
                    ) : null}
                </div>
            </div>
        </section>
    );
}

function FinalistGameplay({ gameId, title }: { gameId: string; title: string }) {
    const { t } = useTranslation();
    const gameplay = useGameplayVideo({ id: gameId, title });
    if (gameplay.isLoading) {
        return <MediaFrameSkeleton className="h-56" />;
    }
    if (!gameplay.videoId) {
        return (
            <p className="rounded-xl border border-dashed border-stone-700 px-4 py-6 text-center text-sm text-stone-500">
                {t('room.shortlist.gameplayUnavailable')}
            </p>
        );
    }
    return <YouTubePlayer videoId={gameplay.videoId} title={title} startSeconds={gameplay.startSeconds} />;
}

function formatMinorAmount(amountMinor: number, currency: string, locale: string): string {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100);
}

const VOTE_TONES = {
    no: 'border-red-500/50 text-red-300 hover:bg-red-500/10',
    maybe: 'border-stone-700 text-stone-300 hover:bg-stone-800/60',
    yes: 'border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10',
} as const;

function VoteButton({
    label,
    shortcut,
    tone,
    onClick,
    disabled,
    icon,
}: {
    label: string;
    shortcut: string;
    tone: keyof typeof VOTE_TONES;
    onClick: () => void;
    disabled: boolean;
    icon?: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={`${label} · ${shortcut}`}
            className={cn(
                'flex min-h-[6rem] flex-col items-center justify-center gap-2 rounded-xl border-2 bg-stone-900 py-5 text-center font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                VOTE_TONES[tone]
            )}
        >
            {icon}
            <span className="text-lg">{label}</span>
            <span className="font-mono text-xs opacity-60" aria-hidden="true">{shortcut}</span>
        </button>
    );
}

/** Reference data carries the human name; the raw platform code never belongs on screen. */
function platformLabel(code: string, platforms: PlatformReference[]): string {
    return platforms.find((platform) => platform.code === code)?.displayName ?? code;
}

function accessLabel(access: string, t: TFunction): string {
    return t(`room.access.${access}`);
}

function participantAccessLabel(access: string, planCode: string | null, t: TFunction): string {
    if (access !== 'SUBSCRIPTION_DOWNLOAD' || !planCode) {
        return accessLabel(access, t);
    }
    const planParts = planCode.split('_');
    const tier = planParts[planParts.length - 1]?.toLowerCase() ?? '';
    const tierLabel = tier ? `${tier[0]?.toUpperCase()}${tier.slice(1)}` : '';
    if (planCode.includes('XBOX_GAME_PASS')) return t('room.access.gamePass', { tier: tierLabel }).trim();
    if (planCode.includes('PLAYSTATION_PLUS')) return t('room.access.playStationPlus', { tier: tierLabel }).trim();
    return t('room.access.SUBSCRIPTION_DOWNLOAD');
}

function onlineAccessLabel(value: string, t: TFunction): string {
    return t(`room.online.${value}`);
}

function warningLabel(value: string, t: TFunction): string {
    return t(`recommendation.warning.${value}`);
}
