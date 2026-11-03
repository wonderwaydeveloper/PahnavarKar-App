import { useCallback, useEffect, useState } from 'react';

import { getUserFacingErrorMessage } from '@/services/user-facing-error';

export function useLegalQuery<T>(load: () => Promise<T>) {
    const [retryCount, setRetryCount] = useState(0);
    const [result, setResult] = useState<{
        load: typeof load;
        retryCount: number;
        value: T | null;
        error: string | null;
    } | null>(null);

    useEffect(() => {
        let active = true;

        void load().then((value) => {
            if (active) setResult({ load, retryCount, value, error: null });
        }).catch((reason: unknown) => {
            if (active) {
                setResult({
                    load,
                    retryCount,
                    value: null,
                    error: getUserFacingErrorMessage(reason, 'بارگذاری اطلاعات انجام نشد.'),
                });
            }
        });

        return () => {
            active = false;
        };
    }, [load, retryCount]);

    const currentResult = result?.load === load && result.retryCount === retryCount ? result : null;
    const retry = useCallback(() => setRetryCount((count) => count + 1), []);

    return {
        value: currentResult?.value ?? null,
        error: currentResult?.error ?? null,
        loading: currentResult === null,
        retry,
    };
}
