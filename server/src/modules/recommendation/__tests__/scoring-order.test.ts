import { describe, expect, it } from 'vitest';
import type { CandidateEvaluation } from '../../../../../shared/index.js';
import { orderCandidatesForParticipant } from '../domain/deterministic-order.js';
import { evaluateCandidate } from '../domain/recommendation-engine.js';
import { axisSimilarity, normalizeAvailableWeights } from '../domain/scoring.js';
import {
    PARTICIPANT_ONE_ID,
    PARTICIPANT_TWO_ID,
    makeCandidate,
    makeContext,
    makeParticipant,
} from './fixtures/decision-fixtures.js';

describe('recommendation scoring', () => {
    it('computes similarity at equal and opposite extremes', () => {
        expect(axisSimilarity(0, 0)).toBe(1);
        expect(axisSimilarity(0, 10)).toBe(0);
        expect(axisSimilarity(3, 8)).toBe(0.5);
    });

    it('does not turn null preferences into zero', () => {
        const result = evaluateCandidate(makeContext(), makeCandidate());
        expect(result.scoreBreakdown.preference.points).toBe(30);
        expect(result.scoreBreakdown.preference.reasons).toContain('PREFERENCE_NEUTRAL_NO_INPUT');
    });

    it('averages only axes with both a target and a game value', () => {
        const participant = makeParticipant({
            preferences: {
                communication: 10,
                skill: null,
                chaos: null,
                strategy: null,
                story: null,
                difficultyTarget: null,
            },
        });
        const base = makeCandidate();
        const candidate = makeCandidate({ profile: { ...base.profile, communication: 10, skill: 0 } });
        expect(evaluateCandidate(makeContext({ participants: [participant] }), candidate).scoreBreakdown.preference.points).toBe(40);
    });

    it('normalizes available weights without NaN or division by zero', () => {
        expect(normalizeAvailableWeights(
            { one: 2, two: 1 },
            { one: true, two: true }
        )).toEqual({ one: 2 / 3, two: 1 / 3 });
        expect(normalizeAvailableWeights(
            { one: 0, two: 0 },
            { one: false, two: false }
        )).toEqual({ one: 0, two: 0 });
    });

    it('keeps every eligible score and dimension inside its declared range', () => {
        const result = evaluateCandidate(makeContext(), makeCandidate());
        expect(result.baseScore).toBeGreaterThanOrEqual(0);
        expect(result.baseScore).toBeLessThanOrEqual(100);
        for (const dimension of Object.values(result.scoreBreakdown)) {
            expect(dimension.points).toBeGreaterThanOrEqual(0);
            expect(dimension.points).toBeLessThanOrEqual(dimension.max);
        }
    });

    it('penalizes PLAYED but not REPLAY_OK novelty', () => {
        const played = evaluateCandidate(makeContext({
            constraints: { excludePreviouslyPlayed: false },
            history: [{ gameId: 'fixture-game', disposition: 'PLAYED' }],
        }), makeCandidate());
        const replay = evaluateCandidate(makeContext({
            history: [{ gameId: 'fixture-game', disposition: 'REPLAY_OK' }],
        }), makeCandidate());
        expect(played.scoreBreakdown.novelty.points).toBe(2.5);
        expect(replay.scoreBreakdown.novelty.points).toBe(10);
    });

    it('scores owned access above purchase access', () => {
        const purchased = evaluateCandidate(makeContext({ participants: [makeParticipant()] }), makeCandidate());
        const owned = evaluateCandidate(makeContext({ participants: [makeParticipant({
            ownedGames: [{ gameId: 'fixture-game', platformCode: 'PC_STEAM' }],
        })] }), makeCandidate());
        expect(owned.scoreBreakdown.access.points).toBeGreaterThan(purchased.scoreBreakdown.access.points);
    });
});

describe('deterministic candidate ordering', () => {
    const evaluations = [
        fakeEvaluation('a', 81),
        fakeEvaluation('b', 82),
        fakeEvaluation('c', 83),
        fakeEvaluation('d', 72),
    ];

    it('returns the same order for the same room and participant', () => {
        const first = orderCandidatesForParticipant(evaluations, 'room-one', PARTICIPANT_ONE_ID);
        const second = orderCandidatesForParticipant(evaluations, 'room-one', PARTICIPANT_ONE_ID);
        expect(second.map((item) => item.gameId)).toEqual(first.map((item) => item.gameId));
    });

    it('does not mutate the materialized source order on refresh', () => {
        const source = evaluations.map((item) => item.gameId);
        orderCandidatesForParticipant(evaluations, 'room-one', PARTICIPANT_ONE_ID);
        expect(evaluations.map((item) => item.gameId)).toEqual(source);
    });

    it('can use a different tie-break for another participant', () => {
        const first = orderCandidatesForParticipant(evaluations, 'room-one', PARTICIPANT_ONE_ID).slice(0, 3);
        const second = orderCandidatesForParticipant(evaluations, 'room-one', PARTICIPANT_TWO_ID).slice(0, 3);
        expect(second.map((item) => item.gameId)).not.toEqual(first.map((item) => item.gameId));
    });

    it('never lets a much lower score bucket jump ahead', () => {
        const ordered = orderCandidatesForParticipant(evaluations, 'room-one', PARTICIPANT_ONE_ID);
        expect(ordered.at(-1)?.gameId).toBe('d');
    });
});

function fakeEvaluation(gameId: string, baseScore: number): CandidateEvaluation {
    return {
        gameId,
        eligible: true,
        rejectionReasons: [],
        warnings: [],
        baseScore,
        scoreBreakdown: {
            preference: { points: 0, max: 40, reasons: ['FIXTURE'] },
            access: { points: 0, max: 25, reasons: ['FIXTURE'] },
            session: { points: 0, max: 15, reasons: ['FIXTURE'] },
            price: { points: 0, max: 10, reasons: ['FIXTURE'] },
            novelty: { points: 0, max: 10, reasons: ['FIXTURE'] },
        },
        assignment: [],
        groupSpendMinor: 0,
        currency: 'BRL',
        confidence: 'VERIFIED',
    };
}
