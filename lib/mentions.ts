export type Mention = {
  start: number;
  end: number;
  userId: string;
  username?: string;
  name?: string;
};
export type MentionUser = { id: string; name: string; username: string };
// Preserve links outside an edit, move later links, and drop links whose text was changed.
export function moveMentions(
  before: string,
  after: string,
  mentions: Mention[],
) {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let end = before.length,
    newEnd = after.length;
  while (
    end > start &&
    newEnd > start &&
    before[end - 1] === after[newEnd - 1]
  ) {
    end--;
    newEnd--;
  }
  const delta = after.length - before.length;
  return mentions.flatMap((m) =>
    m.end <= start
      ? [m]
      : m.start >= end
        ? [{ ...m, start: m.start + delta, end: m.end + delta }]
        : [],
  );
}
