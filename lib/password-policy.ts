import { translate } from './i18n/translate';

export const registrationPasswordPattern =
  '(?=.*[a-z])(?=.*[A-Z])[\x21-\x7E]{6,72}';

export const registrationPasswordHint = translate(
  'trip.672CharactersUppercaseAndLowercaseLatin',
  'ru',
);

export function validRegistrationPassword(value: string) {
  return (
    /^[\x21-\x7E]{6,72}$/.test(value) &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value)
  );
}
