import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { siteOrigin } from '@/lib/public-seo';

export default async function robots(): Promise<MetadataRoute.Robots> {
  if ((await headers()).get('host') !== new URL(siteOrigin).host) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: siteOrigin + '/sitemap.xml',
  };
}
