import { isRunningInExpoGo } from 'expo';
import * as TaskManager from 'expo-task-manager';
import { AuthApiError, fetchCurrentPlan, fetchCurrentUser, getStoredAuthToken, storeCachedAuthenticatedUser } from '@/services/auth-api';
import { clearCachedPlanAccess, saveCachedPlanAccess } from '@/services/plan-access-cache';

const PLAN_ACCESS_REFRESH_TASK = 'pahnavarkar-plan-access-refresh';

TaskManager.defineTask(PLAN_ACCESS_REFRESH_TASK, async ({ error }) => {
    if (error) {
        console.error('اجرای پس‌زمینهٔ به‌روزرسانی دسترسی ناموفق بود.', error);
        const BackgroundTask = await import('expo-background-task');
        return BackgroundTask.BackgroundTaskResult.Failed;
    }

    const BackgroundTask = await import('expo-background-task');
    try {
        const token = await getStoredAuthToken();
        if (!token) {
            return BackgroundTask.BackgroundTaskResult.Success;
        }

        const user = await fetchCurrentUser(token);
        await storeCachedAuthenticatedUser(user, token);
        const currentPlan = await fetchCurrentPlan(token);
        await saveCachedPlanAccess(user.id, token, currentPlan.plan, currentPlan.subscription?.ends_at ?? null);
        return BackgroundTask.BackgroundTaskResult.Success;
    } catch (taskError) {
        if (taskError instanceof AuthApiError && (taskError.status === 401 || taskError.status === 403)) {
            await clearCachedPlanAccess();
        }
        console.error('به‌روزرسانی پس‌زمینهٔ دسترسی پلن ناموفق بود.', taskError);
        return BackgroundTask.BackgroundTaskResult.Failed;
    }
});

export async function registerPlanAccessBackgroundTask(): Promise<void> {
    if (isRunningInExpoGo()) {
        return;
    }

    const BackgroundTask = await import('expo-background-task');
    await BackgroundTask.registerTaskAsync(PLAN_ACCESS_REFRESH_TASK, { minimumInterval: 12 * 60 });
}
