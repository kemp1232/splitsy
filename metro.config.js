const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Lets Metro resolve drizzle-kit's generated .sql migration imports.
// https://orm.drizzle.team/docs/sqlite/connect-expo-sqlite
config.resolver.sourceExts.push('sql');

module.exports = config;
