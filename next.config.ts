import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const config: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'exifr', 'cities.json'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default function configure(phase: string): NextConfig {
  return {
    ...config,
    distDir:
      process.env.QUESTKEEPS_E2E === '1'
        ? '.next-e2e'
        : phase === PHASE_DEVELOPMENT_SERVER
          ? '.next-dev'
          : '.next',
  };
}
