module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Inlines drizzle-kit's generated .sql migration files as raw strings at
    // build time — Metro has no other way to bundle a .sql import.
    // https://orm.drizzle.team/docs/sqlite/connect-expo-sqlite
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
