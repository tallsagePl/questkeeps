export const registrationPasswordPattern =
  '(?=.*[a-z])(?=.*[A-Z])[\x21-\x7E]{6,72}';
export const registrationPasswordHint =
  'От 6 до 72 символов: заглавная и строчная латинские буквы. Можно добавить цифры и знаки.';
export function validRegistrationPassword(value: string) {
  return (
    /^[\x21-\x7E]{6,72}$/.test(value) &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value)
  );
}
