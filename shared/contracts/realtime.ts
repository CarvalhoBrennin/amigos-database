import { z } from 'zod';

export const roomEventTypeSchema = z.enum([
    'PARTICIPANT_JOINED',
    'PARTICIPANT_LEFT',
    'PARTICIPANT_READY_CHANGED',
    'PARTICIPANT_PROFILE_CHANGED',
    'ROOM_CONSTRAINTS_CHANGED',
    'ROOM_HISTORY_CHANGED',
    'ROOM_STARTED',
    'VOTE_PROGRESS_CHANGED',
    'MATCH_CREATED',
    'MATCH_TARGET_REACHED',
    'SHORTLIST_OPENED',
    'ROOM_COMPLETED',
    'ROOM_CANCELLED',
    'ROOM_EXPIRY_CHANGED',
    'ROOM_DELETED',
    'ROOM_EXPIRED',
]);

export const roomEventNotificationSchema = z.object({
    roomId: z.string().uuid(),
    roomCode: z.string().min(4).max(12),
    version: z.number().int().positive(),
    eventType: roomEventTypeSchema,
});

export const roomRealtimeMessageSchema = z.object({
    type: z.literal('ROOM_UPDATED'),
    roomVersion: z.number().int().positive(),
    eventType: roomEventTypeSchema,
});

export type RoomEventType = z.infer<typeof roomEventTypeSchema>;
export type RoomEventNotification = z.infer<typeof roomEventNotificationSchema>;
export type RoomRealtimeMessage = z.infer<typeof roomRealtimeMessageSchema>;
