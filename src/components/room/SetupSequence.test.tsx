import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import type {
    ParticipantPublicSnapshot,
    PlatformReference,
    RoomPublicSnapshot,
    SubscriptionPlanReference,
} from '@shared/index';
import { SetupSequence } from '@/components/room/SetupSequence';

vi.mock('@/services/roomApi', () => ({
    addHistory: vi.fn(),
    searchCatalog: vi.fn(async () => []),
    setMyReady: vi.fn(),
    updateConstraints: vi.fn(),
    updateMyProfile: vi.fn(),
    RoomApiError: class extends Error {},
}));

const platforms: PlatformReference[] = [
    { code: 'PC_STEAM', family: 'PC', displayName: 'PC (Steam)', active: true, sortOrder: 10 },
    { code: 'PC_MICROSOFT_STORE', family: 'PC', displayName: 'PC (Microsoft Store)', active: true, sortOrder: 20 },
    { code: 'XBOX_ONE', family: 'XBOX', displayName: 'Xbox One', active: true, sortOrder: 40 },
    { code: 'XBOX_SERIES', family: 'XBOX', displayName: 'Xbox Series X|S', active: true, sortOrder: 50 },
    { code: 'PS4', family: 'PLAYSTATION', displayName: 'PlayStation 4', active: true, sortOrder: 60 },
    { code: 'PS5', family: 'PLAYSTATION', displayName: 'PlayStation 5', active: true, sortOrder: 70 },
    { code: 'NINTENDO_SWITCH', family: 'NINTENDO', displayName: 'Nintendo Switch', active: true, sortOrder: 80 },
    { code: 'ANDROID', family: 'MOBILE', displayName: 'Android', active: true, sortOrder: 90 },
    { code: 'IOS', family: 'MOBILE', displayName: 'iPhone/iPad', active: true, sortOrder: 100 },
    { code: 'BROWSER', family: 'BROWSER', displayName: 'Navegador', active: true, sortOrder: 110 },
];

const plans: SubscriptionPlanReference[] = [{
    id: '20000000-0000-4000-8000-000000000001',
    serviceCode: 'XBOX_GAME_PASS',
    serviceDisplayName: 'Xbox Game Pass',
    code: 'XBOX_GAME_PASS_ULTIMATE',
    displayName: 'Xbox Game Pass Ultimate',
    regionCode: 'BR',
    active: true,
    capabilities: {
        onlineMultiplayer: true,
        gameCatalogDownload: true,
        monthlyClaimedGames: false,
        cloudStreaming: true,
    },
    sortOrder: 10,
    sourceUrl: null,
    verifiedAt: null,
}];

const participant: ParticipantPublicSnapshot = {
    id: '10000000-0000-4000-8000-000000000001',
    nickname: 'Ana',
    role: 'MEMBER',
    status: 'CONFIGURING',
    platforms: [],
    subscriptions: [],
    ownedGames: [],
    pcTier: null,
    preferences: {
        communication: null,
        skill: null,
        chaos: null,
        strategy: null,
        story: null,
        difficultyTarget: null,
    },
    joinedAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
};

const room = {
    id: '30000000-0000-4000-8000-000000000001',
    code: 'ABCD12',
    status: 'LOBBY',
    version: 1,
    regionCode: 'BR',
    constraints: {
        schemaVersion: 1,
        regionCode: 'BR',
        connectionMode: 'ONLINE',
        accessPolicy: 'ALLOW_PURCHASE',
        budgetMode: 'FLEXIBLE',
        maxPricePerPersonMinor: null,
        maxGroupSpendMinor: null,
        maxSessionMinutes: null,
        excludePreviouslyPlayed: true,
        matchTarget: 5,
        maxEvaluationsPerParticipant: 30,
        requireVerifiedCompatibility: true,
    },
    currentParticipantId: participant.id,
    participants: [participant],
    history: [],
    prefilterSummary: null,
    decision: null,
    createdAt: '2026-08-12T10:00:00.000Z',
    startedAt: null,
    completedAt: null,
    expiresAt: '2026-08-19T10:00:00.000Z',
} as RoomPublicSnapshot;

function renderSequence(overrides: Partial<Parameters<typeof SetupSequence>[0]> = {}) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <SetupSequence
                room={room}
                participant={participant}
                platforms={platforms}
                plans={plans}
                referencesPending={false}
                referencesFailed={false}
                onUpdated={() => undefined}
                {...overrides}
            />
        </QueryClientProvider>
    );
}

function platformFamilyButton(name: RegExp): HTMLElement {
    const familyList = screen.getByRole('group', { name: /famílias de plataforma/i });
    return within(familyList).getByRole('button', { name });
}

describe('SetupSequence', () => {
    it('shows a single question at a time and moves forward on demand', async () => {
        const user = userEvent.setup();
        renderSequence();

        expect(screen.getByRole('heading', { name: /qual é a sua plataforma/i })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: /assinatura ativa/i })).not.toBeInTheDocument();

        await user.click(platformFamilyButton(/nintendo/i));
        await user.click(screen.getByLabelText('Nintendo Switch'));
        await user.click(screen.getByRole('button', { name: /continuar/i }));

        expect(screen.getByRole('heading', { name: /assinatura ativa/i })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: /qual é a sua plataforma/i })).not.toBeInTheDocument();
    });

    it('reveals one platform family at a time and keeps selections from other families', async () => {
        const user = userEvent.setup();
        renderSequence();

        expect(screen.queryByLabelText('PC (Steam)')).not.toBeInTheDocument();
        await user.click(platformFamilyButton(/pc/i));
        expect(screen.getByLabelText('PC (Steam)')).toBeInTheDocument();
        expect(screen.queryByLabelText('PlayStation 5')).not.toBeInTheDocument();

        await user.click(screen.getByLabelText('PC (Steam)'));
        await user.click(platformFamilyButton(/playstation/i));
        await user.click(screen.getByLabelText('PlayStation 5'));
        expect(screen.queryByLabelText('PC (Steam)')).not.toBeInTheDocument();

        await user.click(platformFamilyButton(/pc/i));
        expect(screen.getByLabelText('PC (Steam)')).toBeChecked();
    });

    it('blocks the sequence until at least one platform is selected', async () => {
        const user = userEvent.setup();
        renderSequence();

        expect(screen.getByRole('button', { name: /continuar/i })).toBeDisabled();
        await user.click(platformFamilyButton(/pc/i));
        await user.click(screen.getByLabelText('PC (Steam)'));
        expect(screen.getByRole('button', { name: /continuar/i })).toBeEnabled();
    });

    it('adds the PC tier question to the rail only while a PC platform is selected', async () => {
        const user = userEvent.setup();
        renderSequence();
        const rail = screen.getByRole('navigation', { name: /sequência de configuração/i });

        expect(within(rail).queryByRole('button', { name: /nível do pc/i })).not.toBeInTheDocument();
        await user.click(platformFamilyButton(/pc/i));
        await user.click(screen.getByLabelText('PC (Steam)'));
        expect(within(rail).getByRole('button', { name: /nível do pc/i })).toBeInTheDocument();
        await user.click(screen.getByLabelText('PC (Steam)'));
        expect(within(rail).queryByRole('button', { name: /nível do pc/i })).not.toBeInTheDocument();
    });

    it('jumps straight to the review and offers the save action there', async () => {
        const user = userEvent.setup();
        renderSequence();

        await user.click(platformFamilyButton(/pc/i));
        await user.click(screen.getByLabelText('PC (Steam)'));
        await user.click(screen.getByRole('button', { name: /^revisar$/i }));

        expect(screen.getByRole('heading', { name: /tudo certo para decidir/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /salvar meu setup/i })).toBeEnabled();
    });

    it('opens on the review for someone who already confirmed', () => {
        renderSequence({
            participant: { ...participant, status: 'READY', platforms: ['PC_STEAM'] },
        });

        expect(screen.getByRole('heading', { name: /tudo certo para decidir/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /voltar a configurar/i })).toBeInTheDocument();
    });

    it('has no accessibility violations on a question step', async () => {
        const { container } = renderSequence();
        const results = await axe(container);
        expect(results.violations).toHaveLength(0);
    });

    it('has no accessibility violations on the review step', async () => {
        const user = userEvent.setup();
        const { container } = renderSequence();

        await user.click(platformFamilyButton(/pc/i));
        await user.click(screen.getByLabelText('PC (Steam)'));
        await user.click(screen.getByRole('button', { name: /^revisar$/i }));

        const results = await axe(container);
        expect(results.violations).toHaveLength(0);
    });
});
