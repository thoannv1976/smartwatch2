import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Required for the slim Cloud Run container image (see Dockerfile).
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // firebase-admin uses Node APIs that must not be bundled for the edge runtime.
    serverActions: { bodySizeLimit: '1mb' },
  },
  serverExternalPackages: ['firebase-admin'],
};

export default nextConfig;
