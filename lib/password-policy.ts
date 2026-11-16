import { translate, type LocalizedMessage } from './i18n/translate';

export const registrationPasswordMinLength = 6;

export const registrationPasswordMaxLength = 72;

export const registrationPasswordPattern = `(?=.*[a-z])(?=.*[A-Z])[\\x21-\\x7E]{${registrationPasswordMinLength},${registrationPasswordMaxLength}}`;

export const registrationPasswordHint = translate(
  'trip.672CharactersUppercaseAndLowercaseLatin',
  'ru',
);

export function registrationPasswordErrors(value: string): LocalizedMessage[] {
  const errors: LocalizedMessage[] = [];
  if (value.length < registrationPasswordMinLength)
    errors.push({
      key: 'validation.minLength',
      params: { count: registrationPasswordMinLength },
    });
  if (value.length > registrationPasswordMaxLength)
    errors.push({
      key: 'validation.maxLength',
      params: { count: registrationPasswordMaxLength },
    });
  if (/[^\x21-\x7E]/.test(value))
    errors.push({ key: 'validation.passwordAllowedCharacters' });

  const needsUppercase = !/[A-Z]/.test(value);
  const needsLowercase = !/[a-z]/.test(value);
  if (needsUppercase && needsLowercase)
    errors.push({ key: 'validation.passwordBothCases' });
  else if (needsUppercase) errors.push({ key: 'validation.passwordUppercase' });
  else if (needsLowercase) errors.push({ key: 'validation.passwordLowercase' });

  return errors;
}

export function validRegistrationPassword(value: string) {
  return registrationPasswordErrors(value).length === 0;
}
