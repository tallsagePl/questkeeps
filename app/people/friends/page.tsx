import type { Metadata } from 'next';
import FriendsPage from '@/components/friends-page';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return <FriendsPage />;
}
