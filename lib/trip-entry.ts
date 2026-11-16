export const createTripEntry = '/?create=1';

export const createTripSignInEntry = '/?create=1&mode=login';

export const createTripResetEntry = '/reset-password?create=1';

export const oauthRegistrationHash = '#signup-confirmed';

export function createTripRequested(params: URLSearchParams) {
  return params.get('create') === '1';
}
