import type { MetadataRoute } from 'next';
import { publicSearchPaths, siteOrigin } from '@/lib/public-seo';

export default function sitemap(): MetadataRoute.Sitemap {
  return publicSearchPaths.map((path) => ({ url: siteOrigin + path }));
}
