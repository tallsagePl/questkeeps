import type { Metadata } from 'next';

export const siteOrigin = 'https://questkeeps.ru';

export const publicSearchPaths = ['/', '/about', '/guide', '/privacy'] as const;

export const publicHost = { type: 'host', value: 'questkeeps\\.ru' } as const;

export function publicMetadata(
  path: (typeof publicSearchPaths)[number],
  title: string,
  description: string,
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: siteOrigin + path },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      siteName: 'QuestKeeps',
      locale: 'ru_RU',
      title,
      description,
      url: siteOrigin + path,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}
