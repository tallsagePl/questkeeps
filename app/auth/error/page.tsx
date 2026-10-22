import OAuthError from '@/components/oauth-error';
import { oauthErrorReason, oauthReturnPath } from '@/lib/oauth-errors';

export default async function OAuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <OAuthError
      reason={oauthErrorReason(
        typeof params.reason === 'string' ? params.reason : '',
      )}
      intent={params.intent === 'link' ? 'link' : 'login'}
      returnPath={oauthReturnPath(
        typeof params.returnTo === 'string' ? params.returnTo : '/',
      )}
    />
  );
}
