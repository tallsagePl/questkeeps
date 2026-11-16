export const createTripEntry = '/?create=1';

export const createTripDiskEntry = '/?create=1&disk=1';

export const createTripRegisterEntry = '/?create=1&mode=register';

export const createTripSignInEntry = '/?create=1&mode=login';

export const createTripResetEntry = '/reset-password?create=1';

export const tripsCollectionPath = '/archive/trips';

export const oauthRegistrationHash = '#signup-confirmed';

export function createTripRequested(params: URLSearchParams) {
  return params.get('create') === '1';
}
