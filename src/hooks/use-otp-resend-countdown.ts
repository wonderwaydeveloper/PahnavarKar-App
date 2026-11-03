import { useCallback, useEffect, useState } from 'react';

export function useOtpResendCountdown() {
    const [deadline, setDeadline] = useState<number | null>(null);
    const [secondsRemaining, setSecondsRemaining] = useState(0);

    useEffect(() => {
        if (deadline === null) return;

        const updateRemaining = () => {
            const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            setSecondsRemaining(remaining);
            if (remaining === 0) setDeadline(null);
        };
        const timer = setInterval(updateRemaining, 1000);

        return () => clearInterval(timer);
    }, [deadline]);

    const start = useCallback((seconds: number) => {
        const duration = Math.max(1, Math.ceil(seconds));
        setSecondsRemaining(duration);
        setDeadline(Date.now() + duration * 1000);
    }, []);

    const reset = useCallback(() => {
        setDeadline(null);
        setSecondsRemaining(0);
    }, []);

    return { secondsRemaining, start, reset };
}
