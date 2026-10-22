import Archive from '@/components/archive';

export default async function Shared({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <Archive share={(await params).token} />;
}
