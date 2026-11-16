export const oauthErrors = {
  access_denied: 'oauth.accessDenied',
  invalid_scope: 'oauth.invalidScope',
  unauthorized_client: 'oauth.unauthorizedClient',
  invalid_client: 'oauth.invalidClient',
  session_expired: 'oauth.sessionExpired',
  exchange_failed: 'oauth.exchangeFailed',
  provider_unavailable: 'oauth.providerUnavailable',
  profile_failed: 'oauth.profileFailed',
  account_already_linked: 'oauth.accountAlreadyLinked',
  account_linked_elsewhere: 'oauth.accountLinkedElsewhere',
  account_link_required: 'oauth.accountLinkRequired',
  link_session_changed: 'oauth.linkSessionChanged',
  unknown: 'oauth.unknown',
} as const;

export type OAuthErrorReason = keyof typeof oauthErrors;

export type OAuthIntent = 'link' | 'login' | 'login_disk';

export function oauthIntent(value: unknown): OAuthIntent {
  return value === 'link' || value === 'login_disk' ? value : 'login';
}

export function oauthErrorReason(value: string): OAuthErrorReason {
  return Object.hasOwn(oauthErrors, value)
    ? (value as OAuthErrorReason)
    : 'unknown';
}

export function oauthReturnPath(value: string) {
  return /^\/(?:join\/[A-Za-z0-9_-]+|\?(?:trip=[A-Za-z0-9_-]+(?:&source=1)?|create=1(?:&(?:mode=(?:login|register)|disk=1))?))?$/.test(
    value,
  )
    ? value
    : '/';
}
