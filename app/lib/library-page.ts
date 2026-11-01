const PAGE_SIZE = 48;

export function libraryPage<T extends { ratingKey: string; title: string }>(items: T[], requestedPage: string | null) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const parsed = Number(requestedPage);
  const page = Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, pages) : 1;
  const letters: Record<string, { page: number; ratingKey: string }> = {};
  items.forEach((item, index) => {
    const first = item.title.charAt(0).toUpperCase();
    const letter = /^[A-Z]$/.test(first) ? first : /^[0-9]$/.test(first) ? "#" : "";
    if (letter && !letters[letter]) letters[letter] = { page: Math.floor(index / PAGE_SIZE) + 1, ratingKey: item.ratingKey };
  });
  return { items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pages, total, letters, keys: items.map((item) => item.ratingKey) };
}
