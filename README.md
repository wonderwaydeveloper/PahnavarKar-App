# Welcome to your Expo app 👋

## Mobile account authentication

The account screen uses a phone-only OTP flow through the Laravel API: after verifying the phone, existing users sign in immediately and new users complete a profile with a required name and optional profile photo. The app does not collect or store email addresses. Profile editing supports the user's name and photo; privacy and security options include OTP-confirmed phone changes, session management, OTP-confirmed account deletion, and optional automatic account deletion after 6, 12, or 18 months of inactivity. Account deletion, including inactivity-based deletion, is deferred while a payment or withdrawal is unresolved; the app explains this before requesting deletion and the backend enforces it. Automatic deletion requires a verified phone and a working SMS provider; a successful warning starts a 30-day recovery period, and signing in cancels the pending deletion. Session cards show the operating system, device name, and device model separately; they also show last activity and expiration, and can be revoked individually. At most three active device sessions are allowed; sessions expire after 30 days without authenticated activity, and a session inactive for over seven days is labeled stale. Expired sessions are cleaned up by the backend scheduler and when the session list is loaded or a new login occurs. The app clears a session after the backend rejects an expired token. Browser sign-in remains unavailable in this app because secure browser token storage is not implemented. The photo is uploaded after registration. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the backend API root ending in `/api/v1` before starting Expo. Use a URL reachable from the device (for example, an Android emulator can reach the host machine through `http://10.0.2.2:8000/api/v1`; a physical phone needs the computer's reachable LAN address). Use HTTPS outside local development.

The app's online state is based solely on reaching its Laravel server, not on the device's general internet status. While the app is in the foreground, it checks the public `/up` health route every five seconds; after a failed check it retries with bounded backoff. The status banner reports when it is checking the server or cannot reach it. This is near-real-time polling, not a push connection: a silent server/network failure may take up to the request timeout plus the polling interval to be detected. Checks pause in the background. This checks HTTP server availability, not database or other dependent services.

The app shows account capability restrictions in a persistent, app-wide banner with the affected areas, reason, and expiry. It disables the corresponding write controls while keeping allowed reads, account deletion, and sign-out available; the API remains authoritative and returns a localized explanation if a request is rejected. Full suspension presents a blocking status screen with the suspension reason and end time, plus retry and sign-out actions. A preserved session stays on the device while suspended and can be used again after the account is reactivated; a revoked session is cleared when the server rejects it. Account status is refreshed on login, when returning to the foreground, and after the server reports a restriction. Capability restrictions do not disable local-only calculation tools; those tools are not server-enforced access controls.

The account includes a persistent notification inbox with filters for account access, security, finance and wallet, subscriptions and plans, system services, and official announcements. Unread state and notification priority (normal, important, urgent) are managed separately; users can mark one or all messages as read, and the profile shows an unread-count badge. Push taps open the inbox, while account-status pushes intentionally omit private restriction reasons; details are shown in the sign-in flow or after authentication. Inbox history is retained server-side even when push permission is disabled.

The access token is stored with Expo SecureStore on native iOS and Android. Web authentication is intentionally unavailable because browser storage does not provide the same native secure-storage guarantee. When testing locally while SMS is disabled, enable `MELIPAYAMAK_LOCAL_LOG_ENABLED=true` in the backend's local `.env`, request a code in the app, then read it from the backend's `storage/logs/laravel.log`. This local-only option does not send SMS or return the OTP in the API response; keep it disabled outside local development.

## Wallet and subscription payments

The account's Wallet screen shows the available balance, starts a gateway top-up, and submits withdrawal requests when the backend has enabled withdrawals. Users may choose their saved Iranian IBAN or enter a 16-digit bank card number as the destination for each withdrawal. IBAN and card values are encrypted at rest; user-facing withdrawal history exposes only a masked destination. The IBAN checksum and card checksum are validated, but destination ownership must be checked by an administrator before payout. A withdrawal request snapshots its destination, reserves the requested balance, and is not a bank transfer: an authorized wallet administrator must review it and record the payout reference after transferring funds externally. Pending top-ups can be resumed or checked from the Wallet screen. The app supplies its active Expo return URL when starting a top-up or subscription purchase, and the callback returns to that same session after server-side payment verification. If initiation is ambiguous and the provider has not supplied an authority, the app does not cancel or retry the charge; it keeps new top-ups locked and offers the payment details for support follow-up. During plan checkout, users can pay fully from the wallet only when its balance covers the total, choose combined payment whenever the wallet balance is positive (the wallet is used up to the payable total and any remainder goes to the gateway), or choose the gateway while preserving their wallet balance. The Plans screen also lets users enable or disable wallet-only automatic renewal for their active subscription.

Subscription quotes show the server-calculated wallet and gateway shares after plan credit and discount. If the balance or quote changes before checkout, the app refreshes the quote and asks the user to review the updated amounts before submitting the order. Discount codes apply to manual purchases, upgrades, and scheduled plans; automatic renewal intentionally uses the current plan price without a discount and never falls back to a gateway.

If a subscription payment returns without a confirmed result, the return screen performs only a short, bounded series of status checks and lets the user leave or check again later. The Plans screen also limits its automatic checks and fetches the latest status when revisited. An unresolved order remains open and blocks another subscription purchase; the app does not reopen its gateway session while the result is uncertain. The backend reconciles attempts with a provider reference; an attempt without one cannot be auto-verified and remains unresolved. There is no operator-facing manual resolution workflow yet; define one before Production. Only a confirmed failure releases the order's reserved funds and discount.

## Offline plan access

After a successful server check, the app stores the user's plan in SecureStore for up to 30 days, bounded by the subscription's `ends_at` time when present. When the server monitor reports that the server is unavailable, the app reads this verified cache before making another access request, so the profile subscription badge and plan-filtered home/search tools remain available during the valid offline period. The cached record is bound to both the authenticated user ID and a hash of the current access token, so a different account or session cannot reuse it. Sign-out and session rejection clear the persistent plan cache and in-memory entitlement queries; late responses from an earlier session cannot provide access to a newly authenticated session. A server-side authentication/authorization rejection is never bypassed with cached access. The app refreshes access when the server becomes reachable or the app is foregrounded and also registers a 12-hour minimum-interval background task; iOS and Android schedule this on a best-effort basis and may defer or skip it, especially after the app is force-quit. The shared API client retries a transient GET request at most once after 500 ms; non-GET requests are not automatically replayed. A local expiry notification is scheduled only when notification permission was already granted; otherwise the app asks the user to reconnect to the server when access must be rechecked. Native background execution requires a new development or production build after installing the native module. This client-side offline grace period preserves usability but is not a tamper-proof security boundary for locally executed tools.

For guests, the public free-tier feature flags are cached in AsyncStorage for at most 30 days after a successful catalog response. A temporary network failure can use that bounded cache; the first offline launch, an expired cache, or a non-temporary API rejection cannot create or extend access. This cache contains only public free-tier data and is not an entitlement security boundary.

When the server monitor cannot reach the backend, a compact full-width notice is integrated into the bottom of the shared AppBar. Relevant account pages show one concise, expandable status line beneath it when cached data is displayed or a server-dependent action is unavailable. Expanded details list only essential freshness or action restrictions; they never show cache timestamps, access expiry dates, or account-specific data. These replace the former large offline cards. They do not disable local calculations, but tools remain gated by the applicable plan entitlement; without a valid cached entitlement, the app asks the user to reconnect to the server rather than guessing access.

Server recovery also refreshes the active server-backed screens once per unavailable-to-available transition: notifications and unread counts, wallet and pending top-ups, financial history, purchased plans, plan catalog and pending subscription orders, and payment-return status. React Query reconnect refresh remains enabled as a fallback for active queries.

Financial history keeps fetched pages in a separate SQLite database, independent of the app's calculator database. Page contents are encrypted with AES-GCM; the encryption key is held in SecureStore, and cache entries are scoped to the authenticated user and filter range. Cached pages expire after 30 days and are removed on sign-out, session rejection, account deletion, or switching accounts. Previously fetched pages can be shown offline (including after a restart), but the app cannot provide pages or filters that were never cached. Temporary network/server failures can fall back to cached pages; authentication and other non-temporary server rejections are not bypassed.

The shared cache policy and React Query key registry live in [`src/services/cache-policy.ts`](./src/services/cache-policy.ts). React Query keeps server responses in memory for the current app session; SQLite holds encrypted, user-scoped offline snapshots for financial history, wallet data, plans, pending subscription orders, and notification pages/counts. These snapshots expire after 30 days and are display-only: financial actions, subscription quotes/purchases, order-status decisions, and notification changes still require a live server response. Notification snapshots are cleared after successful notification changes and when the user session is cleared. Entitlement and guest-access records remain in their dedicated SecureStore/AsyncStorage adapters, with their own validation and bounded offline-access rules. Idempotency records are operational safeguards, not display caches, and remain separate.

## Offline calculation tools

The [offline tool matrix](./docs/offline-tool-matrix.csv) covers all 31 tool screens found in the app, including the group-calculation screen. Static review found no online API request in a tool's calculation flow. Twenty-nine screens load bundled calculator, holiday, or seniority JSON into the local `pahnavarkar.db` SQLite database on entry; the other two calculate from user-entered values only. The group-calculation PDF template is also bundled locally; saving/exporting it uses device file storage.

This is a code-based assessment, not proof from a cold-start device run. The code seeds SQLite from bundled assets without a network request, but fresh-install offline seeding has not been verified on an installed native build. Data updates are bundled with app releases rather than fetched by the tools; an app release that changes seed data must also advance the database seed version so existing installs reseed. Database-load errors are surfaced in the affected screen; if loading fails, leaving and reopening that tool retries its initialization.

Tool access is still gated separately from calculation: an authenticated user needs a valid cached plan check, and a guest needs a valid cached free-tier catalog. The authenticated cache lasts at most 30 days after a successful server check and may expire earlier when the subscription ends; the guest cache lasts at most 30 days. Signing in for the first time, an offline first launch without a guest cache, or refreshing an expired/missing access record requires a connection. Thus, local calculation code does not by itself guarantee access to tools after a cold offline launch.

### Local Android validation — 2026-10-27

On an Android 14 phone running Expo Go 57.0.9, with the development bundle already loaded and the app active, mobile data was temporarily disabled. The home screen and an authorized salary-calculation tool remained accessible; mobile data was then restored. This is a manual observation, not an automated test. A cold launch with data disabled stayed on the Expo Go splash because Expo Go could not load the development bundle; this does not establish cold-start behavior for an installed native build. Expo Go also does not validate this app's custom native file-storage module, scheduled notifications, or background task.

# build auto
npx eas-cli@latest workflow:run create-production-builds.yml

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
