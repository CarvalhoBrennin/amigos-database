type LanguageLoadingListener = (isLoading: boolean) => void;

const languageLoadingListeners = new Set<LanguageLoadingListener>();

function setLanguageLoading(isLoading: boolean) {
    languageLoadingListeners.forEach((listener) => {
        listener(isLoading);
    });
}

export { setLanguageLoading };

export function subscribeLanguageLoading(listener: LanguageLoadingListener) {
    languageLoadingListeners.add(listener);
    return () => {
        languageLoadingListeners.delete(listener);
    };
}
