import Archive from '@/components/archive';
import { publicMetadata } from '@/lib/public-seo';

const metadata = publicMetadata(
  '/',
  'Архив фото и видео из путешествий · QuestKeeps',
  'Подключите папку Яндекс.Диска, просмотрите поездку по дням и местам, разберите похожие кадры и поделитесь путешествием по ссылке.',
);

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
  return <Archive publicHome={await isPublicHome(props)} />;
}
