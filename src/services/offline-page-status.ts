export const MAX_OFFLINE_PAGE_NOTICE_TITLE_LENGTH = 55;

export interface OfflinePageNoticeData {
    message: string;
    details: readonly string[];
    hasSavedData?: boolean;
}

export interface OfflinePageNoticeEntry extends OfflinePageNoticeData {
    id: string;
    pathname: string;
}

let entries: OfflinePageNoticeEntry[] = [];
const listeners = new Set<() => void>();

function publish(nextEntries: OfflinePageNoticeEntry[]) {
    entries = nextEntries;
    listeners.forEach((listener) => listener());
}

export function setOfflinePageNotice(
    id: string,
    pathname: string,
    notice: OfflinePageNoticeData | null,
): void {
    const remainingEntries = entries.filter((entry) => entry.id !== id);
    if (notice === null) {
        if (remainingEntries.length !== entries.length) publish(remainingEntries);
        return;
    }
    if ([...notice.message].length > MAX_OFFLINE_PAGE_NOTICE_TITLE_LENGTH) {
        throw new RangeError(
            `Offline page notice titles must not exceed ${MAX_OFFLINE_PAGE_NOTICE_TITLE_LENGTH} characters.`,
        );
    }

    const existing = entries.find((entry) => entry.id === id);
    if (
        existing
        && existing.pathname === pathname
        && existing.message === notice.message
        && existing.hasSavedData === notice.hasSavedData
        && existing.details.length === notice.details.length
        && existing.details.every((detail, index) => detail === notice.details[index])
    ) {
        return;
    }

    publish([...remainingEntries, { ...notice, id, pathname, details: [...notice.details] }]);
}

export function subscribeToOfflinePageNotices(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getOfflinePageNotices(): readonly OfflinePageNoticeEntry[] {
    return entries;
}
