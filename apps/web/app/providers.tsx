'use client';

// ponytail: re-exports SessionProvider so layout.tsx (server) can wrap it in a client boundary
export { SessionProvider } from '../lib/session';
