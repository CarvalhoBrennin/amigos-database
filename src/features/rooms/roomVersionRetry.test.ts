import { describe, expect, it, vi } from 'vitest';
import { RoomApiError } from '@/services/roomApi';
import { withRoomVersion } from '@/features/rooms/roomVersionRetry';

describe('withRoomVersion', () => {
    it('sends the write with the version it was given', async () => {
        const run = vi.fn(async (version: number) => version);
        await expect(withRoomVersion(7, run)).resolves.toBe(7);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('replays the write once against the version the server reports', async () => {
        const run = vi.fn(async (version: number) => {
            if (version === 3) {
                throw new RoomApiError(409, 'ROOM_VERSION_CONFLICT', 'stale', 5);
            }
            return version;
        });

        await expect(withRoomVersion(3, run)).resolves.toBe(5);
        expect(run).toHaveBeenNthCalledWith(1, 3);
        expect(run).toHaveBeenNthCalledWith(2, 5);
    });

    it('surfaces a second conflict instead of retrying forever', async () => {
        const run = vi.fn(async () => {
            throw new RoomApiError(409, 'ROOM_VERSION_CONFLICT', 'stale', 9);
        });

        await expect(withRoomVersion(3, run)).rejects.toBeInstanceOf(RoomApiError);
        expect(run).toHaveBeenCalledTimes(2);
    });

    it('never retries errors that are not version conflicts', async () => {
        const run = vi.fn(async () => {
            throw new RoomApiError(422, 'PARTICIPANT_SETUP_INCOMPLETE', 'no platform');
        });

        await expect(withRoomVersion(3, run)).rejects.toBeInstanceOf(RoomApiError);
        expect(run).toHaveBeenCalledTimes(1);
    });
});
