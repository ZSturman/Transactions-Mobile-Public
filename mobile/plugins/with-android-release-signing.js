const { withAppBuildGradle } = require("expo/config-plugins");
// Keep credentials out of generated source. The release script injects environment
// variables only for the Gradle process. Never fall back to the debug certificate.
module.exports = (config) =>
  withAppBuildGradle(config, (config) => {
    const marker = "// Transactions release signing";
    if (!config.modResults.contents.includes(marker))
      config.modResults.contents += `
${marker}
def transactionsStore = System.getenv('TRANSACTIONS_STORE_FILE')
if (transactionsStore) {
    android.signingConfigs.create('transactionsRelease') {
        storeFile file(transactionsStore)
        storePassword System.getenv('TRANSACTIONS_STORE_PASSWORD')
        keyAlias System.getenv('TRANSACTIONS_KEY_ALIAS')
        keyPassword System.getenv('TRANSACTIONS_KEY_PASSWORD')
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.transactionsRelease
} else {
    android.buildTypes.release.signingConfig = null
    gradle.taskGraph.whenReady { graph ->
        if (graph.allTasks.any { it.name.toLowerCase().contains('release') }) {
            throw new GradleException('Use npm run android:release with a private upload keystore.')
        }
    }
}
`;
    return config;
  });
