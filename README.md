# Welcome to your Expo app 👋

## Mobile account authentication

The account screen uses a phone-first OTP flow through the Laravel API: after verifying the phone, existing users sign in immediately and new users are prompted to complete a profile with a required name and optional email and profile photo. Email addresses can be verified with a one-time code from the profile editor; changing an email clears its previous verification. The profile page supports editing those details, while privacy and security options include OTP-confirmed phone changes, cross-platform session management, account-data export, OTP-confirmed account deletion, and optional automatic account deletion after 6, 12, or 18 months of inactivity. Automatic deletion requires a verified phone and email plus real email and SMS delivery configured on the backend; both channels receive a warning and a 30-day recovery period, and signing in cancels the pending deletion. Session cards show the operating system, device name, and device model separately; they also show last activity and expiration, and can be revoked individually. At most three active device sessions are allowed; sessions expire after 30 days without authenticated activity, and a session inactive for over seven days is labeled stale. Expired sessions are cleaned up by the backend scheduler and when the session list is loaded or a new login occurs. The app clears a session after the backend rejects an expired token. This describes backend support; browser sign-in remains unavailable in this app because secure browser token storage is not implemented. The photo is uploaded after registration. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the backend API root ending in `/api/v1` before starting Expo. Use a URL reachable from the device (for example, an Android emulator can reach the host machine through `http://10.0.2.2:8000/api/v1`; a physical phone needs the computer's reachable LAN address). Use HTTPS outside local development.

The access token is stored with Expo SecureStore on native iOS and Android. Web authentication is intentionally unavailable because browser storage does not provide the same native secure-storage guarantee. When testing locally while SMS is disabled, enable `MELIPAYAMAK_LOCAL_LOG_ENABLED=true` in the backend's local `.env`, request a code in the app, then read it from the backend's `storage/logs/laravel.log`. This local-only option does not send SMS or return the OTP in the API response; keep it disabled outside local development.

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
