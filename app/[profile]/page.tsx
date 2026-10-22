import { notFound } from 'next/navigation';
import { publicProfile } from '@/lib/profiles';
import PublicProfile from '@/components/public-profile';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ profile: string }>;
}) {
  const { profile: encoded } = await params;
  let path: string;
  try {
    path = decodeURIComponent(encoded);
  } catch {
    notFound();
  }
  if (!/^@[a-zA-Z0-9_]{3,30}$/.test(path)) notFound();
  const profile = publicProfile(path.slice(1));
  if (!profile) notFound();
  return <PublicProfile profile={profile} />;
}
