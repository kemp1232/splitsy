// Strips diacritics and lowercases, so "pena" matches "Peña".
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Home-list search: every whitespace-separated token of the query must appear
// in at least one of the fields (any order). An empty query matches everything.
export function matchesHomeSearch(
  fields: ReadonlyArray<string | null | undefined>,
  query: string,
): boolean {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = fields
    .filter((field): field is string => typeof field === 'string')
    .map(normalize);
  return tokens.every((token) => haystack.some((field) => field.includes(token)));
}
