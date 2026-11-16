import type { Metadata } from 'next';

export const siteOrigin = 'https://questkeeps.ru';

export const publicSearchPaths = ['/', '/about', '/guide', '/privacy'] as const;

export const publicHost = { type: 'host', value: 'questkeeps\\.ru' } as const;

const previewImage = {
  url: siteOrigin + '/opengraph-image.png',
  alt: 'QuestKeeps',
};

export function publicMetadata(
  path: (typeof publicSearchPaths)[number],
  shareTitle: string,
  description: string,
): Metadata {
  return {
    description,
    alternates: { canonical: siteOrigin + path },
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
    openGraph: {
      type: 'website',
      siteName: 'QuestKeeps',
      locale: 'ru_RU',
      title: shareTitle,
      description,
      url: siteOrigin + path,
      images: [previewImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle,
      description,
      images: [previewImage],
    },
  };
}
