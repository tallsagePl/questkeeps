import Archive from '@/components/archive';
export default async function Join({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <Archive invite={(await params).token} />;
}
