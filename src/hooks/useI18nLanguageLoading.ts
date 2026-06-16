import { useEffect, useState } from 'react';
import { subscribeLanguageLoading } from '@/i18n/loading';

export function useI18nLanguageLoading() {
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => subscribeLanguageLoading(setIsLoading), []);

    return isLoading;
}
