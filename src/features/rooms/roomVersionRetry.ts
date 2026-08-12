import { RoomApiError } from '@/services/roomApi';

/**
 * A lobby version moves every time anyone touches the room, so a rejected write
 * is almost always "someone else just joined", not a genuine conflict. The
 * payload always belongs to the person sending it, so replay it once against
 * the version the server reported. A second rejection is a real conflict and
 * surfaces to the person.
 */
export async function withRoomVersion<T>(
    expectedRoomVersion: number,
    run: (version: number) => Promise<T>
): Promise<T> {
    try {
        return await run(expectedRoomVersion);
    } catch (error) {
        if (
            error instanceof RoomApiError
            && error.code === 'ROOM_VERSION_CONFLICT'
            && typeof error.currentVersion === 'number'
        ) {
            return run(error.currentVersion);
        }
        throw error;
    }
}
