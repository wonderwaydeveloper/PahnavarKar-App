const colorTokens = require('./src/constants/theme-color-tokens.json');

module.exports = ({ config }) => ({
    ...config,
    android: {
        ...config.android,
        adaptiveIcon: {
            ...config.android.adaptiveIcon,
            backgroundColor: colorTokens.native.adaptiveIconBackground,
        },
    },
    plugins: config.plugins.map((plugin) => {
        if (!Array.isArray(plugin) || plugin[0] !== 'expo-splash-screen') {
            return plugin;
        }

        return [
            plugin[0],
            {
                ...plugin[1],
                backgroundColor: colorTokens.native.splashBackground.light,
                dark: {
                    ...plugin[1].dark,
                    backgroundColor: colorTokens.native.splashBackground.dark,
                },
            },
        ];
    }),
});
