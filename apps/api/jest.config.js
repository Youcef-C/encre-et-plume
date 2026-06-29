/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: '<rootDir>/../tsconfig.json',
    }],
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    // <rootDir> = apps/api/src; need 3 levels up to reach monorepo root
    '^@encre-et-plume/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
    // Resolve NodeNext-style explicit `.js` specifiers (e.g. shared's `export * from './auth.js'`)
    // back to their TS source so ts-jest can find them.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
