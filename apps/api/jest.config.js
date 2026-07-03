/** @type {import('jest').Config} */
module.exports = {
  // 'ts' before 'json': the `.js`-stripping mapper below resolves './genres'
  // (from shared's `export * from './genres.js'`) against both genres.ts and
  // genres.json (same basename) — 'ts' must win or the JSON array (no named
  // exports) shadows the module.
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: '<rootDir>/../tsconfig.json',
    }],
  },
  testEnvironment: 'node',
  maxWorkers: '25%', // ponytail: cap worker pool so parallel/agent test runs don't flood the machine
  moduleNameMapper: {
    // <rootDir> = apps/api/src; need 3 levels up to reach monorepo root
    '^@encre-et-plume/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
    // Resolve NodeNext-style explicit `.js` specifiers (e.g. shared's `export * from './auth.js'`)
    // back to their TS source so ts-jest can find them.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
