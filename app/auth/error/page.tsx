import OAuthError from '@/components/oauth-error';
import {
  oauthErrorReason,
  oauthIntent,
  oauthReturnPath,
} from '@/lib/oauth-errors';

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
      intent={oauthIntent(params.intent)}
      returnPath={oauthReturnPath(
        typeof params.returnTo === 'string' ? params.returnTo : '/',
      )}
    />
  );
}
