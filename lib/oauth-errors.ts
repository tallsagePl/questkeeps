export const oauthErrors = {
  access_denied: 'oauth.accessDenied',
  invalid_scope: 'oauth.invalidScope',
  unauthorized_client: 'oauth.unauthorizedClient',
  invalid_client: 'oauth.invalidClient',
  session_expired: 'oauth.sessionExpired',
  exchange_failed: 'oauth.exchangeFailed',
  account_already_linked: 'oauth.accountAlreadyLinked',
  account_link_required: 'oauth.accountLinkRequired',
  unknown: 'oauth.unknown',
} as const;

export type OAuthErrorReason = keyof typeof oauthErrors;

export function oauthErrorReason(value: string): OAuthErrorReason {
  return Object.hasOwn(oauthErrors, value)
    ? (value as OAuthErrorReason)
    : 'unknown';
}

export function oauthReturnPath(value: string) {
  return /^\/(?:join\/[A-Za-z0-9_-]+|\?(?:trip=[A-Za-z0-9_-]+|create=1))?$/.test(
    value,
  )
    ? value
    : '/';
}
