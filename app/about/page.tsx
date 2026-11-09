import About from '@/components/about';
import { publicMetadata, siteOrigin } from '@/lib/public-seo';

const aboutMetadata = publicMetadata(
  '/about',
  'О QuestKeeps — фото из поездки по дням и на карте',
  'QuestKeeps собирает фото и видео из папки Яндекс.Диска в архив поездки. Откройте места на карте, сравните похожие кадры и поделитесь поездкой по ссылке.',
);

const shareImage = {
  url: siteOrigin + '/about/lisbon-share.jpg',
  width: 1200,
  height: 630,
  alt: 'Вид на Лиссабон и реку Тежу',
};

export const metadata = {
  ...aboutMetadata,
  openGraph: { ...aboutMetadata.openGraph, images: [shareImage] },
  twitter: { ...aboutMetadata.twitter, images: [shareImage] },
};

export default function Page() {
  return <About />;
}
