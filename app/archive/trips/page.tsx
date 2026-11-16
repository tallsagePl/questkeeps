import type { Metadata } from 'next';
import Archive from '@/components/archive';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return <Archive collectionOnly />;
}
