export function parseRouteGameId(id: number | string | null | undefined): number | null {
    if (id === null || id === undefined) {
        return null;
    }

    if (typeof id === 'number') {
        return Number.isInteger(id) && id > 0 ? id : null;
    }

    const trimmedId = id.trim();
    if (!/^\d+$/.test(trimmedId)) {
        return null;
    }

    const numericId = Number(trimmedId);
    return Number.isSafeInteger(numericId) && numericId > 0 ? numericId : null;
}
