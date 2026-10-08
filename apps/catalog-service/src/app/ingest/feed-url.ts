export function normalizeFeedUrl(raw: string): string {
  const url = new URL(raw.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported feed protocol: ${url.protocol}`);
  }
  url.hash = '';
  url.username = '';
  url.password = '';
  return url.toString();
}
