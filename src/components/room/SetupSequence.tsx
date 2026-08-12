import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
    ArrowRight,
    Check,
    ChevronLeft,
    Gamepad2,
    Globe,
    Loader2,
    Monitor,
    Plus,
    Search,
    Smartphone,
    X,
} from 'lucide-react';
import {
    type ParticipantProfile,
    type ParticipantPublicSnapshot,
    type PlatformCode,
    type PlatformFamily,
    type PlatformReference,
    type RoomConstraints,
    type RoomPublicSnapshot,
    type SubscriptionPlanReference,
} from '@shared/index';
import {
    addHistory,
    searchCatalog,
    setMyReady,
    updateConstraints,
    updateMyProfile,
} from '@/services/roomApi';
import { Button } from '@/components/ui/Button';
import { ChoiceTile } from '@/components/room/ChoiceTile';
import { MutationError } from '@/components/room/MutationError';
import { PreferenceDial } from '@/components/room/PreferenceDial';
import { StepRail } from '@/components/room/StepRail';
import {
    buildSetupSteps,
    resolveStepIndex,
    ROOM_PREFERENCE_KEYS,
    type SetupStep,
} from '@/components/room/roomSteps';
import { participantToProfile } from '@/components/room/roomSelectors';
import { roomCabinetAmber, roomCard, roomChoiceIdle, roomMarqueeAmber, roomMeter } from '@/components/room/roomStyles';
import { withRoomVersion } from '@/features/rooms/roomVersionRetry';

const FAMILY_ICONS: Record<PlatformFamily, ReactNode> = {
    PC: <Monitor className="h-4 w-4" />,
    XBOX: <Gamepad2 className="h-4 w-4" />,
    PLAYSTATION: <Gamepad2 className="h-4 w-4" />,
    NINTENDO: <Gamepad2 className="h-4 w-4" />,
    MOBILE: <Smartphone className="h-4 w-4" />,
    BROWSER: <Globe className="h-4 w-4" />,
};

const FAMILY_ORDER: PlatformFamily[] = ['PC', 'PLAYSTATION', 'XBOX', 'MOBILE', 'BROWSER', 'NINTENDO'];

const PC_TIER_LABEL_KEYS = {
    LOW: 'room.setup.pcLow',
    MID: 'room.setup.pcMid',
    HIGH: 'room.setup.pcHigh',
} as const;

function stepLabel(step: SetupStep, t: TFunction): string {
    switch (step.kind) {
        case 'platforms': return t('room.setup.platforms');
        case 'subscriptions': return t('room.setup.subscriptions');
        case 'pc': return t('room.setup.pcTier');
        case 'owned': return t('room.setup.owned');
        case 'history': return t('room.history.title');
        case 'rules': return t('room.constraints.title');
        case 'review': return t('room.setup.reviewTitle');
        default: return t(`room.setup.${step.preferenceKey}`);
    }
}

function stepQuestion(step: SetupStep, t: TFunction): string {
    switch (step.kind) {
        case 'platforms': return t('room.setup.questionPlatforms');
        case 'subscriptions': return t('room.setup.questionSubscriptions');
        case 'pc': return t('room.setup.questionPc');
        case 'owned': return t('room.setup.questionOwned');
        case 'history': return t('room.setup.questionHistory');
        case 'rules': return t('room.setup.questionRules');
        case 'review': return t('room.setup.reviewQuestion');
        default: return t(`room.setup.question_${step.preferenceKey}`);
    }
}

function stepHelp(step: SetupStep, t: TFunction): string {
    switch (step.kind) {
        case 'platforms': return t('room.setup.description');
        case 'subscriptions': return t('room.setup.subscriptionHelp');
        case 'pc': return t('room.setup.pcHelp');
        case 'owned': return t('room.setup.ownedHelp');
        case 'history': return t('room.history.help');
        case 'rules': return t('room.constraints.help');
        case 'review': return t('room.setup.reviewHelp');
        default: return t('room.setup.preferencesHelp');
    }
}

interface SetupSequenceProps {
    room: RoomPublicSnapshot;
    participant: ParticipantPublicSnapshot;
    platforms: PlatformReference[];
    plans: SubscriptionPlanReference[];
    referencesPending: boolean;
    referencesFailed: boolean;
    onUpdated: (room: RoomPublicSnapshot) => void;
}

/**
 * The setup is a conversation: one question per screen, a visible map of the
 * sequence, and a closing review that turns the answers into a commitment.
 */
export function SetupSequence({
    room,
    participant,
    platforms,
    plans,
    referencesPending,
    referencesFailed,
    onUpdated,
}: SetupSequenceProps) {
    const { t } = useTranslation();
    const savedProfile = useMemo(() => participantToProfile(participant), [participant]);
    const savedSignature = JSON.stringify(savedProfile);
    const [profile, setProfile] = useState<ParticipantProfile>(savedProfile);
    // Someone who already confirmed comes back to the review, not to question one.
    const [activeStepId, setActiveStepId] = useState<string>(
        participant.status === 'READY' ? 'review' : 'platforms'
    );
    const [gameTitles, setGameTitles] = useState<Record<string, string>>({});
    const isHost = participant.role === 'HOST';
    const isReady = participant.status === 'READY';

    // Only re-seed local answers when the stored profile really changed, so a
    // teammate's realtime update never discards work in progress.
    useEffect(() => {
        setProfile(JSON.parse(savedSignature) as ParticipantProfile);
    }, [savedSignature]);

    const hasPcPlatform = platforms.some(
        (platform) => platform.family === 'PC' && profile.platforms.includes(platform.code)
    );
    const steps = useMemo(
        () => buildSetupSteps({ hasPcPlatform, hasSubscriptionPlans: plans.length > 0, isHost }),
        [hasPcPlatform, plans.length, isHost]
    );
    const stepIndex = resolveStepIndex(steps, activeStepId);
    const activeStep = steps[stepIndex] ?? steps[0]!;
    const isReview = activeStep.kind === 'review';
    const canAdvance = activeStep.kind !== 'platforms' || profile.platforms.length > 0;
    const isDirty = JSON.stringify(profile) !== savedSignature;
    const hasSavedPlatform = participant.platforms.length > 0;

    const profileMutation = useMutation({
        mutationFn: () => withRoomVersion(room.version, (version) => updateMyProfile(room.code, version, profile)),
        onSuccess: onUpdated,
    });
    const readyMutation = useMutation({
        mutationFn: () => withRoomVersion(room.version, (version) => setMyReady(room.code, version, !isReady)),
        onSuccess: onUpdated,
    });

    const goTo = (index: number) => {
        const next = steps[Math.min(Math.max(index, 0), steps.length - 1)];
        if (next) setActiveStepId(next.id);
    };

    const rememberTitle = (gameId: string, title: string) => {
        setGameTitles((current) => ({ ...current, [gameId]: title }));
    };

    return (
        <section className={`${roomCabinetAmber} room-workbench min-w-0`} aria-labelledby="room-setup-title">
            <div className={roomMarqueeAmber}>
                <h2 id="room-setup-title" className="text-xl font-bold text-stone-100">
                    {t('room.setup.title')}
                </h2>
                <span className="font-mono text-sm text-stone-400">
                    {t('room.setup.stepOf', { current: stepIndex + 1, total: steps.length })}
                </span>
            </div>

            <div className="room-workbench__body p-5 sm:p-7">
                <StepRail
                    className="room-workbench__rail"
                    items={steps.map((step) => ({ id: step.id, label: stepLabel(step, t) }))}
                    activeIndex={stepIndex}
                    navLabel={t('room.setup.sequenceLabel')}
                    progressLabel={t('room.setup.progressLabel')}
                    onSelect={goTo}
                />

                <div key={activeStep.id} className="room-workbench__question room-step-enter mt-8">
                    <h3 className="text-2xl font-bold leading-tight text-stone-100 sm:text-3xl">
                        {stepQuestion(activeStep, t)}
                    </h3>
                    <p className="mt-3 max-w-2xl text-stone-400">{stepHelp(activeStep, t)}</p>

                    <div className="mt-7">
                        {activeStep.kind === 'platforms' ? (
                            <PlatformsQuestion
                                platforms={platforms}
                                pending={referencesPending}
                                failed={referencesFailed}
                                selected={profile.platforms}
                                onToggle={(code) => setProfile((current) => ({
                                    ...current,
                                    platforms: current.platforms.includes(code)
                                        ? current.platforms.filter((item) => item !== code)
                                        : [...current.platforms, code],
                                }))}
                            />
                        ) : null}

                        {activeStep.kind === 'subscriptions' ? (
                            <SubscriptionsQuestion
                                plans={plans}
                                selected={profile.subscriptions}
                                onToggle={(code) => setProfile((current) => ({
                                    ...current,
                                    subscriptions: current.subscriptions.includes(code)
                                        ? current.subscriptions.filter((item) => item !== code)
                                        : [...current.subscriptions, code],
                                }))}
                            />
                        ) : null}

                        {activeStep.kind === 'pc' ? (
                            <PcTierQuestion
                                value={profile.pcTier ?? null}
                                onChange={(pcTier) => setProfile((current) => ({ ...current, pcTier }))}
                            />
                        ) : null}

                        {activeStep.kind === 'preference' ? (
                            <PreferenceDial
                                label={t(`room.setup.${activeStep.preferenceKey}`)}
                                lowAnchor={t(`room.setup.anchorLow_${activeStep.preferenceKey}`)}
                                highAnchor={t(`room.setup.anchorHigh_${activeStep.preferenceKey}`)}
                                value={profile.preferences[activeStep.preferenceKey]}
                                onChange={(value) => setProfile((current) => ({
                                    ...current,
                                    preferences: { ...current.preferences, [activeStep.preferenceKey]: value },
                                }))}
                            />
                        ) : null}

                        {activeStep.kind === 'owned' ? (
                            <OwnedGamesQuestion
                                owned={profile.ownedGames}
                                titles={gameTitles}
                                onAdd={(game) => {
                                    rememberTitle(game.id, game.title);
                                    setProfile((current) => (
                                        current.ownedGames.some((item) => item.gameId === game.id)
                                            ? current
                                            : { ...current, ownedGames: [...current.ownedGames, { gameId: game.id, platformCode: null }] }
                                    ));
                                }}
                                onRemove={(gameId) => setProfile((current) => ({
                                    ...current,
                                    ownedGames: current.ownedGames.filter((item) => item.gameId !== gameId),
                                }))}
                            />
                        ) : null}

                        {activeStep.kind === 'history' ? (
                            <HistoryQuestion room={room} onUpdated={onUpdated} />
                        ) : null}

                        {activeStep.kind === 'rules' ? (
                            <RulesQuestion room={room} onUpdated={onUpdated} />
                        ) : null}

                        {isReview ? (
                            <ReviewSummary
                                profile={profile}
                                platforms={platforms}
                                plans={plans}
                                titles={gameTitles}
                                constraints={room.constraints}
                                isHost={isHost}
                            />
                        ) : null}
                    </div>
                </div>

                <div className="room-action-dock mt-8 border-t border-stone-800 pt-6">
                    {isReview ? (
                        <div className="space-y-4">
                            {isReady ? (
                                <p className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300" role="status">
                                    <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                    {t('room.readiness.readyNotice')}
                                </p>
                            ) : isDirty ? (
                                <p className={`${roomCard} px-4 py-3 text-sm text-stone-400`} role="status">
                                    {t('room.setup.pendingNotice')}
                                </p>
                            ) : hasSavedPlatform ? (
                                <p className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300" role="status">
                                    <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                    {t('room.setup.savedNotice')}
                                </p>
                            ) : (
                                <p className={`${roomCard} px-4 py-3 text-sm text-stone-400`} role="status">
                                    {t('room.readiness.description')}
                                </p>
                            )}

                            <div className="flex flex-wrap items-center gap-3">
                                <Button variant="ghost" size="lg" onClick={() => goTo(stepIndex - 1)}>
                                    <ChevronLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                                    {t('room.setup.back')}
                                </Button>
                                <span className="ml-auto" />
                                {isDirty || !hasSavedPlatform ? (
                                    <Button
                                        size="lg"
                                        onClick={() => profileMutation.mutate()}
                                        isLoading={profileMutation.isPending}
                                        disabled={profileMutation.isPending || profile.platforms.length === 0}
                                    >
                                        {profileMutation.isPending ? t('room.setup.saving') : t('room.setup.save')}
                                    </Button>
                                ) : (
                                    <Button
                                        size="lg"
                                        variant={isReady ? 'secondary' : 'primary'}
                                        onClick={() => readyMutation.mutate()}
                                        isLoading={readyMutation.isPending}
                                        disabled={readyMutation.isPending}
                                    >
                                        {isReady ? null : <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
                                        {isReady ? t('room.readiness.edit') : t('room.readiness.ready')}
                                    </Button>
                                )}
                            </div>
                            {profileMutation.error ? <MutationError error={profileMutation.error} /> : null}
                            {readyMutation.error ? <MutationError error={readyMutation.error} /> : null}
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center gap-3">
                            <Button variant="ghost" size="lg" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}>
                                <ChevronLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                                {t('room.setup.back')}
                            </Button>
                            <span className="ml-auto" />
                            {profile.platforms.length > 0 ? (
                                <Button variant="secondary" size="lg" onClick={() => goTo(steps.length - 1)}>
                                    {t('room.setup.goToReview')}
                                </Button>
                            ) : null}
                            <Button size="lg" onClick={() => goTo(stepIndex + 1)} disabled={!canAdvance}>
                                {t('room.setup.next')}
                                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                            </Button>
                        </div>
                    )}
                    {!isReview && !canAdvance ? (
                        <p className="mt-3 text-sm text-stone-500">{t('room.setup.needPlatform')}</p>
                    ) : null}
                </div>
            </div>
        </section>
    );
}

function PlatformsQuestion({
    platforms,
    pending,
    failed,
    selected,
    onToggle,
}: {
    platforms: PlatformReference[];
    pending: boolean;
    failed: boolean;
    selected: PlatformCode[];
    onToggle: (code: PlatformCode) => void;
}) {
    const { t } = useTranslation();
    const panelId = useId();
    const [requestedFamily, setRequestedFamily] = useState<PlatformFamily | null>(null);
    const families = FAMILY_ORDER.filter((family) => platforms.some((platform) => platform.family === family));
    const firstSelectedFamily = families.find((family) => (
        platforms.some((platform) => platform.family === family && selected.includes(platform.code))
    )) ?? null;
    const activeFamily = requestedFamily && families.includes(requestedFamily)
        ? requestedFamily
        : firstSelectedFamily;

    if (pending) {
        return <QuestionLoading label={t('room.setup.loadingPlatforms')} />;
    }
    if (failed) {
        return <QuestionError label={t('room.setup.platformsError')} />;
    }
    if (platforms.length === 0) {
        return <QuestionEmpty label={t('room.setup.platformsEmpty')} />;
    }

    return (
        <div className="platform-cascade">
            <div
                className="platform-cascade__families"
                role="group"
                aria-label={t('room.setup.platformFamilyList')}
            >
                {families.map((family, index) => {
                    const familyLabel = t(`room.platformFamily.${family}`);
                    const selectedCount = platforms.filter((platform) => (
                        platform.family === family && selected.includes(platform.code)
                    )).length;
                    const expanded = activeFamily === family;

                    return (
                        <button
                            key={family}
                            type="button"
                            className="platform-family"
                            data-active={expanded ? 'true' : 'false'}
                            data-selected={selectedCount > 0 ? 'true' : 'false'}
                            aria-label={selectedCount > 0
                                ? `${familyLabel}. ${t('room.setup.platformSelectionCount', { count: selectedCount })}`
                                : familyLabel}
                            aria-expanded={expanded}
                            aria-controls={activeFamily ? `${panelId}-variants` : undefined}
                            onClick={() => setRequestedFamily(family)}
                        >
                            <span className="platform-family__index" aria-hidden="true">
                                {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="platform-family__icon" aria-hidden="true">{FAMILY_ICONS[family]}</span>
                            <span className="platform-family__label">{familyLabel}</span>
                            <span className="platform-family__status">
                                {selectedCount > 0 ? (
                                    <>
                                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                        <span aria-label={t('room.setup.platformSelectionCount', { count: selectedCount })}>
                                            {String(selectedCount).padStart(2, '0')}
                                        </span>
                                    </>
                                ) : (
                                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>

            {activeFamily ? (
                <section
                    id={`${panelId}-variants`}
                    className="platform-cascade__variants room-step-enter"
                    aria-labelledby={`${panelId}-variant-title`}
                >
                    <div className="platform-cascade__variant-heading">
                        <span className="platform-cascade__connector" aria-hidden="true" />
                        <p id={`${panelId}-variant-title`}>
                            {t('room.setup.platformVariantQuestion', {
                                family: t(`room.platformFamily.${activeFamily}`),
                            })}
                        </p>
                    </div>
                    <fieldset>
                        <legend className="sr-only">
                            {t('room.setup.platformVariantQuestion', {
                                family: t(`room.platformFamily.${activeFamily}`),
                            })}
                        </legend>
                        <div className="platform-cascade__variant-grid">
                            {platforms
                                .filter((platform) => platform.family === activeFamily)
                                .sort((left, right) => left.sortOrder - right.sortOrder)
                                .map((platform) => (
                                    <ChoiceTile
                                        key={platform.code}
                                        type="checkbox"
                                        label={platform.displayName}
                                        checked={selected.includes(platform.code)}
                                        onChange={() => onToggle(platform.code)}
                                    />
                                ))}
                        </div>
                    </fieldset>
                </section>
            ) : null}
        </div>
    );
}

function SubscriptionsQuestion({
    plans,
    selected,
    onToggle,
}: {
    plans: SubscriptionPlanReference[];
    selected: string[];
    onToggle: (code: string) => void;
}) {
    const { t } = useTranslation();
    const services = [...new Set(plans.map((plan) => plan.serviceDisplayName))];

    return (
        <div className="space-y-6">
            {services.map((service) => (
                <fieldset key={service}>
                    <legend className="mb-3 text-sm font-semibold text-stone-400">{service}</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {plans
                            .filter((plan) => plan.serviceDisplayName === service)
                            .map((plan) => (
                                <ChoiceTile
                                    key={plan.code}
                                    type="checkbox"
                                    label={plan.displayName}
                                    hint={planCapabilities(plan, t)}
                                    checked={selected.includes(plan.code)}
                                    onChange={() => onToggle(plan.code)}
                                />
                            ))}
                    </div>
                </fieldset>
            ))}
            <p className="text-sm text-stone-500">{t('room.setup.noSubscriptionHint')}</p>
        </div>
    );
}

function planCapabilities(plan: SubscriptionPlanReference, t: TFunction): string {
    return [
        plan.capabilities.gameCatalogDownload ? t('room.setup.capabilityCatalog') : null,
        plan.capabilities.onlineMultiplayer ? t('room.setup.capabilityOnline') : null,
        plan.capabilities.cloudStreaming ? t('room.setup.capabilityCloud') : null,
        plan.capabilities.monthlyClaimedGames ? t('room.setup.capabilityMonthly') : null,
    ].filter((entry): entry is string => entry !== null).join(' · ');
}

function PcTierQuestion({
    value,
    onChange,
}: {
    value: 'LOW' | 'MID' | 'HIGH' | null;
    onChange: (value: 'LOW' | 'MID' | 'HIGH' | null) => void;
}) {
    const { t } = useTranslation();
    const tiers = [
        { id: 'LOW', label: t('room.setup.pcLow'), hint: t('room.setup.pcLowHint') },
        { id: 'MID', label: t('room.setup.pcMid'), hint: t('room.setup.pcMidHint') },
        { id: 'HIGH', label: t('room.setup.pcHigh'), hint: t('room.setup.pcHighHint') },
        { id: 'UNKNOWN', label: t('room.setup.pcUnknown'), hint: t('room.setup.pcUnknownHint') },
    ] as const;

    return (
        <fieldset>
            <legend className="sr-only">{t('room.setup.pcTier')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
                {tiers.map((tier) => (
                    <ChoiceTile
                        key={tier.id}
                        type="radio"
                        name="pc-tier"
                        stacked
                        label={tier.label}
                        hint={tier.hint}
                        checked={tier.id === 'UNKNOWN' ? value === null : value === tier.id}
                        onChange={() => onChange(tier.id === 'UNKNOWN' ? null : tier.id)}
                    />
                ))}
            </div>
        </fieldset>
    );
}

function CatalogSearch({
    label,
    placeholder,
    onSelect,
    excludedIds,
}: {
    label: string;
    placeholder: string;
    onSelect: (game: { id: string; title: string }) => void;
    excludedIds: string[];
}) {
    const { t } = useTranslation();
    const fieldId = useId();
    const [query, setQuery] = useState('');
    const trimmed = query.trim();
    const results = useQuery({
        queryKey: ['catalog-search', trimmed],
        queryFn: () => searchCatalog(trimmed),
        enabled: trimmed.length >= 2,
        staleTime: 30_000,
    });
    const options = (results.data ?? []).filter((game) => !excludedIds.includes(game.id));

    return (
        <div>
            <label className="mb-2 block text-sm font-semibold text-stone-400" htmlFor={fieldId}>{label}</label>
            <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden="true" />
                <input
                    id={fieldId}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={placeholder}
                    aria-label={label}
                    className="w-full rounded-xl border border-stone-700 bg-stone-900 py-3 pl-11 pr-4 text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none"
                />
            </div>

            {trimmed.length >= 2 ? (
                <div className="mt-3" aria-live="polite">
                    {results.isPending ? (
                        <QuestionLoading label={t('room.setup.searching')} />
                    ) : results.error ? (
                        <QuestionError label={t('room.setup.searchError')} />
                    ) : options.length === 0 ? (
                        <QuestionEmpty label={t('room.setup.searchEmpty')} />
                    ) : (
                        <ul className="space-y-2">
                            {options.map((game) => (
                                <li key={game.id}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onSelect(game);
                                            setQuery('');
                                        }}
                                        className={roomChoiceIdle}
                                    >
                                        <Plus className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                                        <span className="flex-1 font-semibold text-stone-100">{game.title}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : null}
        </div>
    );
}

function OwnedGamesQuestion({
    owned,
    titles,
    onAdd,
    onRemove,
}: {
    owned: ParticipantProfile['ownedGames'];
    titles: Record<string, string>;
    onAdd: (game: { id: string; title: string }) => void;
    onRemove: (gameId: string) => void;
}) {
    const { t } = useTranslation();

    return (
        <div className="space-y-6">
            <CatalogSearch
                label={t('room.setup.ownedSearch')}
                placeholder={t('room.setup.ownedPlaceholder')}
                excludedIds={owned.map((game) => game.gameId)}
                onSelect={onAdd}
            />

            <div>
                <p className="mb-3 text-sm font-semibold text-stone-400">
                    {t('room.setup.ownedList', { total: owned.length })}
                </p>
                {owned.length === 0 ? (
                    <QuestionEmpty label={t('room.setup.ownedEmpty')} />
                ) : (
                    <ul className="space-y-2">
                        {owned.map((game) => (
                            <li key={game.gameId} className={`${roomCard} flex items-center gap-3 px-4 py-3`}>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-semibold text-stone-100">
                                        {titles[game.gameId] ?? t('room.setup.ownedGame', { gameId: game.gameId })}
                                    </span>
                                    <span className="block text-sm text-stone-500">
                                        {game.platformCode ?? t('room.setup.platformUnknown')}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onRemove(game.gameId)}
                                    aria-label={t('room.setup.removeGame', { gameId: titles[game.gameId] ?? game.gameId })}
                                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-400 transition-colors hover:bg-stone-800/50 hover:text-stone-100"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                    {t('room.setup.remove')}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function HistoryQuestion({
    room,
    onUpdated,
}: {
    room: RoomPublicSnapshot;
    onUpdated: (room: RoomPublicSnapshot) => void;
}) {
    const { t } = useTranslation();
    const mutation = useMutation({
        mutationFn: (gameId: string) => withRoomVersion(
            room.version,
            (version) => addHistory(room.code, version, gameId, 'PLAYED')
        ),
        onSuccess: onUpdated,
    });

    return (
        <div className="space-y-6">
            <CatalogSearch
                label={t('room.history.search')}
                placeholder={t('room.history.placeholder')}
                excludedIds={room.history.map((entry) => entry.gameId)}
                onSelect={(game) => mutation.mutate(game.id)}
            />

            <div>
                <p className="mb-3 text-sm font-semibold text-stone-400">
                    {t('room.history.list', { total: room.history.length })}
                </p>
                {room.history.length === 0 ? (
                    <QuestionEmpty label={t('room.history.empty')} />
                ) : (
                    <ul className="space-y-2">
                        {room.history.map((entry) => (
                            <li key={entry.gameId} className={`${roomCard} flex items-center gap-3 px-4 py-3`}>
                                <span className="flex-1 font-semibold text-stone-100">{entry.title}</span>
                                <span className="rounded bg-stone-800 px-2 py-0.5 text-xs font-medium text-stone-300">
                                    {t(`room.history.${entry.disposition}`)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {mutation.isPending ? <QuestionLoading label={t('room.history.adding')} /> : null}
            {mutation.error ? <MutationError error={mutation.error} /> : null}
        </div>
    );
}

function RulesQuestion({
    room,
    onUpdated,
}: {
    room: RoomPublicSnapshot;
    onUpdated: (room: RoomPublicSnapshot) => void;
}) {
    const { t } = useTranslation();
    const [constraints, setConstraints] = useState<RoomConstraints>(room.constraints);
    const mutation = useMutation({
        mutationFn: () => withRoomVersion(
            room.version,
            (version) => updateConstraints(room.code, version, constraints)
        ),
        onSuccess: onUpdated,
    });

    useEffect(() => setConstraints(room.constraints), [room.constraints]);

    return (
        <div className="space-y-6">
            <ChoiceTile
                type="checkbox"
                label={t('room.constraints.downloadOnly')}
                hint={t('room.constraints.downloadOnlyHelp')}
                checked={constraints.accessPolicy === 'NO_PURCHASE_REQUIRED'}
                onChange={() => setConstraints((current) => ({
                    ...current,
                    accessPolicy: current.accessPolicy === 'NO_PURCHASE_REQUIRED' ? 'ALLOW_PURCHASE' : 'NO_PURCHASE_REQUIRED',
                }))}
            />

            <div className={`${roomCard} p-5`}>
                <label className="block font-semibold text-stone-100" htmlFor="match-target">
                    {t('room.constraints.matchTarget')}
                </label>
                <p className="mt-1 text-sm text-stone-500">{t('room.constraints.matchTargetHelp')}</p>
                <input
                    id="match-target"
                    type="number"
                    min={1}
                    max={20}
                    value={constraints.matchTarget}
                    onChange={(event) => setConstraints((current) => ({
                        ...current,
                        matchTarget: Number(event.target.value),
                    }))}
                    className="mt-4 w-24 rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 font-mono text-stone-100 focus:border-amber-500 focus:outline-none"
                />
            </div>

            <Button
                variant="secondary"
                onClick={() => mutation.mutate()}
                isLoading={mutation.isPending}
                disabled={mutation.isPending}
            >
                {mutation.isPending ? t('room.constraints.saving') : t('room.constraints.save')}
            </Button>
            {mutation.error ? <MutationError error={mutation.error} /> : null}
        </div>
    );
}

function ReviewSummary({
    profile,
    platforms,
    plans,
    titles,
    constraints,
    isHost,
}: {
    profile: ParticipantProfile;
    platforms: PlatformReference[];
    plans: SubscriptionPlanReference[];
    titles: Record<string, string>;
    constraints: RoomConstraints;
    isHost: boolean;
}) {
    const { t } = useTranslation();
    const platformNames = profile.platforms.map(
        (code) => platforms.find((platform) => platform.code === code)?.displayName ?? code
    );
    const planNames = profile.subscriptions.map(
        (code) => plans.find((plan) => plan.code === code)?.displayName ?? code
    );

    return (
        <div className="grid gap-4 md:grid-cols-2">
            <SummaryCard title={t('room.setup.platforms')} values={platformNames} />
            {plans.length > 0 ? <SummaryCard title={t('room.setup.subscriptions')} values={planNames} /> : null}
            {profile.platforms.some((code) => platforms.find((platform) => platform.code === code)?.family === 'PC') ? (
                <SummaryCard
                    title={t('room.setup.pcTier')}
                    values={[profile.pcTier ? t(PC_TIER_LABEL_KEYS[profile.pcTier]) : t('room.setup.pcUnknown')]}
                />
            ) : null}
            <SummaryCard
                title={t('room.setup.owned')}
                values={profile.ownedGames.map((game) => titles[game.gameId] ?? t('room.setup.ownedGame', { gameId: game.gameId }))}
            />

            <section className={`${roomCard} p-5 md:col-span-2`}>
                <h4 className="text-sm font-semibold text-stone-400">{t('room.setup.preferences')}</h4>
                <ul className="mt-4 space-y-3">
                    {ROOM_PREFERENCE_KEYS.map((key) => {
                        const value = profile.preferences[key];
                        return (
                            <li key={key} className="flex items-center gap-4">
                                <span className="w-28 shrink-0 text-sm text-stone-300">{t(`room.setup.${key}`)}</span>
                                <span className={`${roomMeter} flex-1`}>
                                    <span
                                        className="room-meter__fill block"
                                        style={{ width: value === null ? '0%' : `${(value / 10) * 100}%` }}
                                    />
                                </span>
                                <span className="w-16 shrink-0 text-right font-mono text-sm text-stone-500">
                                    {value === null ? t('room.setup.noPreferenceShort') : `${value}/10`}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </section>

            {isHost ? (
                <SummaryCard
                    title={t('room.constraints.title')}
                    values={[
                        constraints.accessPolicy === 'NO_PURCHASE_REQUIRED'
                            ? t('room.constraints.downloadOnly')
                            : t('room.constraints.allowPurchase'),
                        t('room.constraints.matchTargetValue', { value: constraints.matchTarget }),
                    ]}
                />
            ) : null}
        </div>
    );
}

function SummaryCard({ title, values }: { title: string; values: string[] }) {
    const { t } = useTranslation();
    return (
        <section className={`${roomCard} p-5`}>
            <h4 className="text-sm font-semibold text-stone-400">{title}</h4>
            {values.length === 0 ? (
                <p className="mt-3 text-sm text-stone-500">{t('room.setup.summaryEmpty')}</p>
            ) : (
                <ul className="mt-3 flex flex-wrap gap-2">
                    {values.map((value) => (
                        <li key={value} className="rounded bg-stone-800 px-2 py-0.5 text-xs font-medium text-stone-300">
                            {value}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function QuestionLoading({ label }: { label: string }) {
    return (
        <p className="flex items-center gap-2 text-sm text-stone-400" role="status">
            <Loader2 className="loading-motion h-4 w-4 animate-spin" aria-hidden="true" />
            {label}
        </p>
    );
}

function QuestionError({ label }: { label: string }) {
    return (
        <p className="rounded-xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-400" role="alert">
            {label}
        </p>
    );
}

function QuestionEmpty({ label }: { label: string }) {
    return (
        <p className="rounded-xl border border-dashed border-stone-700 px-4 py-6 text-center text-sm text-stone-500">
            {label}
        </p>
    );
}
