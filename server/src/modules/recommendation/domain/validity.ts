export interface TemporalRecord {
    validFrom: string | null;
    validUntil: string | null;
}

export function isTemporallyActive(record: TemporalRecord, now: Date): boolean {
    const timestamp = now.getTime();
    return (!record.validFrom || new Date(record.validFrom).getTime() <= timestamp)
        && (!record.validUntil || new Date(record.validUntil).getTime() >= timestamp);
}

export function isRegionCompatible(recordRegion: string | null, roomRegion: string): boolean {
    return recordRegion === null || recordRegion === roomRegion;
}
