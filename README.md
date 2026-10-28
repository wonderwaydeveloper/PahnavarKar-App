# Welcome to your Expo app 👋

## Mobile account authentication

The account screen uses a phone-only OTP flow through the Laravel API: after verifying the phone, existing users sign in immediately and new users complete a profile with a required name and optional profile photo. The app does not collect or store email addresses. Profile editing supports the user's name and photo; privacy and security options include OTP-confirmed phone changes, session management, OTP-confirmed account deletion, and optional automatic account deletion after 6, 12, or 18 months of inactivity. Automatic deletion requires a verified phone and a working SMS provider; a successful warning starts a 30-day recovery period, and signing in cancels the pending deletion. Session cards show the operating system, device name, and device model separately; they also show last activity and expiration, and can be revoked individually. At most three active device sessions are allowed; sessions expire after 30 days without authenticated activity, and a session inactive for over seven days is labeled stale. Expired sessions are cleaned up by the backend scheduler and when the session list is loaded or a new login occurs. The app clears a session after the backend rejects an expired token. Browser sign-in remains unavailable in this app because secure browser token storage is not implemented. The photo is uploaded after registration. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the backend API root ending in `/api/v1` before starting Expo. Use a URL reachable from the device (for example, an Android emulator can reach the host machine through `http://10.0.2.2:8000/api/v1`; a physical phone needs the computer's reachable LAN address). Use HTTPS outside local development.

The access token is stored with Expo SecureStore on native iOS and Android. Web authentication is intentionally unavailable because browser storage does not provide the same native secure-storage guarantee. When testing locally while SMS is disabled, enable `MELIPAYAMAK_LOCAL_LOG_ENABLED=true` in the backend's local `.env`, request a code in the app, then read it from the backend's `storage/logs/laravel.log`. This local-only option does not send SMS or return the OTP in the API response; keep it disabled outside local development.

## Offline plan access

After a successful server check, the app stores the user's plan in SecureStore for up to 48 hours, bounded by the subscription's `ends_at` time when present. The cached record is bound to both the authenticated user ID and a hash of the current access token, so a different account or session cannot reuse it. Sign-out and session rejection clear the persistent plan cache and in-memory entitlement queries; late responses from an earlier session cannot provide access to a newly authenticated session. A server-side authentication/authorization rejection is never bypassed with cached access. The app refreshes access when brought online or foregrounded and also registers a 12-hour minimum-interval background task; iOS and Android schedule this on a best-effort basis and may defer or skip it, especially after the app is force-quit. The shared API client retries a transient GET request at most once after 500 ms; non-GET requests are not automatically replayed. A local expiry notification is scheduled only when notification permission was already granted; otherwise the app asks the user to connect when access must be rechecked. Native background execution requires a new development or production build after installing the native module. This client-side offline grace period preserves usability but is not a tamper-proof security boundary for locally executed tools.

When the network monitor confirms the app is offline, a non-blocking banner appears above the current screen to explain that server-dependent features may be unavailable. The banner disappears when connectivity returns and does not disable local calculations.

## Offline calculation tools

The [offline tool matrix](./docs/offline-tool-matrix.csv) covers all 31 tool screens found in the app, including the group-calculation screen. Static review found no online API request in a tool's calculation flow. Twenty-nine screens load bundled calculator, holiday, or seniority JSON into the local `pahnavarkar.db` SQLite database on entry; the other two calculate from user-entered values only. The group-calculation PDF template is also bundled locally; saving/exporting it uses device file storage.

This is a code-based assessment, not proof from a cold-start device run. The code seeds SQLite from bundled assets without a network request, but fresh-install offline seeding has not been verified on an installed native build. Data updates are bundled with app releases rather than fetched by the tools; an app release that changes seed data must also advance the database seed version so existing installs reseed. Database-load errors are surfaced in the affected screen; if loading fails, leaving and reopening that tool retries its initialization.

Tool access is still gated separately from calculation: an authenticated user needs a valid cached plan check. The cache lasts at most 48 hours after a successful server check and may expire earlier when the subscription ends. Signing in for the first time or refreshing an expired/missing access record requires a connection. Thus, local calculation code does not by itself guarantee access to tools after a cold offline launch.

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
