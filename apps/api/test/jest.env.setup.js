// H1: dev-latest / dev-token-stash seams are opt-in only (default OFF). The existing test suite
// exercises those seams the same way the Playwright e2e webServer does — enable them for the
// whole jest run rather than repeating the flag in every spec file.
process.env['ENABLE_DEV_AUTH_SEAMS'] = 'true';
