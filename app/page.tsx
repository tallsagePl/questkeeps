import Archive from '@/components/archive';
import { publicMetadata, siteOrigin } from '@/lib/public-seo';

const metadata = publicMetadata(
  '/',
  'Фото из поездки по дням и на карте · QuestKeeps',
  'Подключите папку Яндекс Диска, чтобы посмотреть фото и видео по дням, найти кадры на карте и поделиться поездкой. Оригиналы останутся на Диске.',
);

const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'QuestKeeps',
  url: siteOrigin + '/',
  inLanguage: 'ru',
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function isPublicHome({ searchParams }: Props) {
  return Object.keys(await searchParams).every((key) =>
    /^(utm_[a-z_]+|yclid|gclid)$/i.test(key),
  );
}

export async function generateMetadata(props: Props) {
  return (await isPublicHome(props))
    ? metadata
    : { robots: { index: false, follow: false } };
}

export default async function Home(props: Props) {
  const publicHome = await isPublicHome(props);
  return (
    <>
      {publicHome && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
        />
      )}
      <Archive publicHome={publicHome} />
    </>
  );
}
