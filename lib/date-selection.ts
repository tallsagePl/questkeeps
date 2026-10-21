export function dateSelection(value: string): [string, string] {
  const [from, to] = value.split('..');
  return [from || '', to || from || ''];
}
export function includesDate(day: string, value: string) {
  if (!value) return true;
  const [from, to] = dateSelection(value);
  return day.slice(0, 10) >= from && day.slice(0, 10) <= to;
}
