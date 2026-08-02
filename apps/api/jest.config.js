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
  // sanitize-html (CS-5 XSS sanitizer) depends on htmlparser2@12 and its parser-stack majors
  // (dom-serializer@3 / domelementtype@3 / domhandler@6 / domutils@4 / entities@8), all ESM-only
  // ("type":"module"). Node runs them natively; ts-jest must transpile them, so exclude that stack from
  // the node_modules transform-ignore (everything else under .pnpm stays ignored for speed).
  // marked@18 (legal markdown → HTML for the seed) is ESM-only too; Node 24 requires it natively,
  // jest 29 cannot, so it joins the transpiled list.
  transformIgnorePatterns: [
    '/node_modules/.pnpm/(?!(htmlparser2|dom-serializer|domelementtype|domhandler|domutils|entities|marked)@)',
    // prisma/*.js are plain CommonJS seed scripts run by `node` — jest can require them as-is.
    // ts-jest would refuse them (allowJs is off), so keep them out of the transform entirely.
    '/apps/api/prisma/',
  ],
  maxWorkers: '25%', // ponytail: cap worker pool so parallel/agent test runs don't flood the machine
  // H1: ENABLE_DEV_AUTH_SEAMS opt-in for the dev-latest/token-stash test seams (see test/jest.env.setup.js)
  setupFiles: ['<rootDir>/../test/jest.env.setup.js'],
  moduleNameMapper: {
    // <rootDir> = apps/api/src; need 3 levels up to reach monorepo root
    '^@encre-et-plume/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
    // Resolve NodeNext-style explicit `.js` specifiers (e.g. shared's `export * from './auth.js'`)
    // back to their TS source so ts-jest can find them.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
