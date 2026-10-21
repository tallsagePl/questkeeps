export const oauthErrors = {
  access_denied: {
    ru: 'Разрешение на доступ не получено. Повторите подключение и разрешите доступ на странице Яндекса.',
    en: 'Access was not granted. Try connecting again and allow access on the Yandex page.',
  },
  invalid_scope: {
    ru: 'В настройках приложения Яндекса не включены нужные разрешения. Добавьте login:info, login:email, login:avatar и cloud_api:disk.read в разделе «Доступ к данным».',
    en: 'The Yandex app is missing required permissions. Add login:info, login:email, login:avatar and cloud_api:disk.read under Data access.',
  },
  unauthorized_client: {
    ru: 'Яндекс пока не разрешает авторизацию для этого приложения. Проверьте его статус, модерацию и ограничения в кабинете Яндекс OAuth.',
    en: 'Yandex does not currently allow authorization for this app. Check its status, moderation and restrictions in Yandex OAuth.',
  },
  invalid_client: {
    ru: 'Яндекс не распознал приложение. Проверьте ClientID в настройках QuestKeeps.',
    en: 'Yandex did not recognize the app. Check the ClientID in QuestKeeps settings.',
  },
  session_expired: {
    ru: 'Попытка авторизации истекла или была открыта в другом браузере. Начните подключение заново.',
    en: 'This authorization attempt expired or was opened in another browser. Start connecting again.',
  },
  exchange_failed: {
    ru: 'Яндекс не выдал токен доступа. Проверьте ClientID и Client secret приложения и повторите подключение.',
    en: 'Yandex did not issue an access token. Check the app ClientID and Client secret, then try again.',
  },
  account_already_linked: {
    ru: 'У вас уже подключён Яндекс. Чтобы использовать другой аккаунт, сначала отключите текущий в профиле QuestKeeps.',
    en: 'You already have a Yandex account connected. Disconnect it in your QuestKeeps profile before connecting another account.',
  },
  unknown: {
    ru: 'Не удалось подключить Яндекс. Повторите попытку; если ошибка останется, проверьте настройки приложения в Яндекс OAuth.',
    en: 'Could not connect to Yandex. Try again; if the issue persists, check the app settings in Yandex OAuth.',
  },
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
