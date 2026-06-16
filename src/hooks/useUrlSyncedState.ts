import { useEffect, useRef } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';

interface UseUrlSyncedStateOptions<T> {
    parsedFromUrl: T;
    currentState: T;
    searchParamsString: string;
    setSearchParams: SetURLSearchParams;
    serialize: (state: T) => string;
    applyState: (state: T) => void;
    normalize?: (state: T) => T;
}

export function useUrlSyncedState<T>({
    parsedFromUrl,
    currentState,
    searchParamsString,
    setSearchParams,
    serialize,
    applyState,
    normalize,
}: UseUrlSyncedStateOptions<T>) {
    const lastSerializedStateRef = useRef<string | null>(null);
    const suppressNextUrlWriteRef = useRef(true);

    useEffect(() => {
        const normalizedState = normalize ? normalize(parsedFromUrl) : parsedFromUrl;
        const serializedState = serialize(normalizedState);

        suppressNextUrlWriteRef.current = true;
        lastSerializedStateRef.current = serializedState;
        applyState(normalizedState);

        if (searchParamsString !== serializedState) {
            setSearchParams(serializedState, { replace: true });
        }
    }, [applyState, normalize, parsedFromUrl, searchParamsString, serialize, setSearchParams]);

    useEffect(() => {
        if (suppressNextUrlWriteRef.current) {
            suppressNextUrlWriteRef.current = false;
            return;
        }

        const normalizedState = normalize ? normalize(currentState) : currentState;
        const serializedState = serialize(normalizedState);

        if (serializedState === lastSerializedStateRef.current) {
            return;
        }

        lastSerializedStateRef.current = serializedState;
        applyState(normalizedState);
        setSearchParams(serializedState, { replace: true });
    }, [applyState, currentState, normalize, serialize, setSearchParams]);
}
