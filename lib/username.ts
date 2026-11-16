export const usernameMaxLength = 30;

export const usernamePattern = /^[a-z0-9_]{3,30}$/;

export function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, '').toLowerCase();
}
