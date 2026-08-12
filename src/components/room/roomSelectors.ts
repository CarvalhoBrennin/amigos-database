import {
    defaultParticipantPreferences,
    type ParticipantProfile,
    type ParticipantPublicSnapshot,
} from '@shared/index';

/** People who left keep their row in the snapshot but no longer belong to the room. */
export function activeParticipants(participants: ParticipantPublicSnapshot[]): ParticipantPublicSnapshot[] {
    return participants.filter((participant) => participant.status !== 'LEFT');
}

export function participantToProfile(participant: ParticipantPublicSnapshot): ParticipantProfile {
    return {
        platforms: participant.platforms,
        subscriptions: participant.subscriptions,
        ownedGames: participant.ownedGames,
        pcTier: participant.pcTier,
        preferences: participant.preferences ?? defaultParticipantPreferences,
    };
}
