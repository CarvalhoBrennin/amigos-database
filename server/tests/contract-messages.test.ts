import { describe, expect, it } from 'vitest';
import {
    decisionDataImportSchema,
    externalSourceUrlSchema,
    participantProfileSchema,
} from '../../shared/index.js';

describe('shared validation messages', () => {
    it('returns Brazilian Portuguese messages for client-visible validation failures', () => {
        const sourceError = externalSourceUrlSchema.safeParse('http://example.com/source');
        expect(sourceError.success).toBe(false);
        expect(sourceError.success ? '' : sourceError.error.issues[0]?.message).toBe('A fonte externa deve usar HTTPS');

        const profileError = participantProfileSchema.safeParse({
            platforms: ['PC_STEAM', 'PC_STEAM'],
            subscriptions: [],
            ownedGames: [],
            preferences: {
                communication: null,
                skill: null,
                chaos: null,
                strategy: null,
                story: null,
                difficultyTarget: null,
            },
        });
        expect(profileError.success).toBe(false);
        expect(profileError.success ? '' : profileError.error.issues[0]?.message).toBe('Não é permitido repetir plataformas');

        const importError = decisionDataImportSchema.safeParse({
            schemaVersion: 1,
            games: [{
                gameId: '1',
                profile: {
                    minOnlinePlayers: 4,
                    maxOnlinePlayers: 2,
                    minSessionMinutes: 30,
                    maxSessionMinutes: 60,
                    installSizeMb: 1,
                    minPcTier: null,
                    freeToPlay: false,
                    communication: null,
                    skill: null,
                    chaos: null,
                    strategy: null,
                    story: null,
                    difficultyCode: 'MODERATE',
                    dataStatus: 'PARTIAL',
                    sourceType: null,
                    sourceUrl: null,
                    lastVerifiedAt: null,
                },
                offerings: [],
                networkPools: [],
            }],
        });
        expect(importError.success).toBe(false);
        expect(importError.success ? '' : importError.error.issues[0]?.message).toBe('O máximo de jogadores deve ser pelo menos o mínimo');
    });
});
