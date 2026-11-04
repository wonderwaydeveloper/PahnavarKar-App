module.exports = {
    preset: 'jest-expo',
    testMatch: ['<rootDir>/src/__tests__/*.test.[jt]s?(x)'],
    transformIgnorePatterns: [
        '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@material/material-color-utilities))',
        '/node_modules/react-native-reanimated/plugin/',
        '/node_modules/@react-native/babel-preset/',
    ],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
};
