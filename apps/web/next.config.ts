import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Transpile the shared workspace package (exports raw TS source)
  transpilePackages: ['@encre-et-plume/shared'],
};

export default nextConfig;
