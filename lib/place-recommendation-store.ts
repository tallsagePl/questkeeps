export type SavedSuggestion = { pageid: number; title: string; dist: number };

export type SavedSearches = Map<string, SavedSuggestion[]>;

// Search results are saved discoveries, not a temporary resource cache.
// Keys include photo revision and coordinates, so changed photos are searched again.
export function readSavedSearches(
  raw: string | null,
  validKeys: Set<string>,
): SavedSearches {
  const result: SavedSearches = new Map();
  try {
    const value: unknown = JSON.parse(raw || 'null');
    if (!Array.isArray(value)) return result;
    for (const entry of value) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const [key, suggestions] = entry;
      if (
        typeof key !== 'string' ||
        !validKeys.has(key) ||
        !Array.isArray(suggestions)
      )
        continue;
      if (
        !suggestions.every(
          (p) =>
            p &&
            Number.isInteger(p.pageid) &&
            p.pageid > 0 &&
            typeof p.title === 'string' &&
            Number.isFinite(p.dist) &&
            p.dist >= 0,
        )
      )
        continue;
      result.set(
        key,
        suggestions.map(({ pageid, title, dist }) => ({ pageid, title, dist })),
      );
    }
  } catch {}
  return result;
}
