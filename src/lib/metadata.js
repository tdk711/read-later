import { db } from './db.js';

/**
 * Page titles are fetched through public metadata services because browsers
 * block direct cross-origin HTML requests. This is best-effort: the app works
 * offline and always falls back to a title derived from the URL.
 *
 * If you self-host this app you can replace these with your own tiny endpoint.
 */
const sources = [
  {
    name: 'microlink',
    url: (url) => `https://api.microlink.io/?url=${encodeURIComponent(url)}`,
    async parse(response) {
      const payload = await response.json();
      return payload?.data?.title;
    },
  },
  {
    name: 'jina',
    url: (url) => `https://r.jina.ai/${url}`,
    async parse(response) {
      const text = await response.text();
      return text.match(/^Title:\s*(.+)$/m)?.[1];
    },
  },
  {
    name: 'allorigins',
    url: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    async parse(response) {
      return titleFromHtml(await response.text());
    },
  },
  {
    name: 'codetabs',
    url: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    async parse(response) {
      return titleFromHtml(await response.text());
    },
  },
];

const TIMEOUT_MS = 7000;

function titleFromHtml(html) {
  if (!html || !html.includes('<')) return null;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const candidates = [
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content'),
      doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content'),
      doc.querySelector('title')?.textContent,
      doc.querySelector('h1')?.textContent,
    ];

    for (const candidate of candidates) {
      const title = cleanTitle(candidate);
      if (title) return title;
    }
  } catch {
    // Malformed HTML is fine — try the next source.
  }

  return null;
}

function cleanTitle(value) {
  const title = value?.replace(/\s+/g, ' ').trim();
  return title ? title.slice(0, 220) : null;
}

export async function fetchPageTitle(url) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;

  for (const source of sources) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(source.url(url), {
        signal: controller.signal,
        headers: { Accept: 'application/json, text/html, text/plain' },
      });

      if (!response.ok) continue;

      const title = cleanTitle(await source.parse(response));
      if (title) return title;
    } catch {
      // Network error, timeout or blocked source: try the next one.
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

/** Look up a nicer title in the background and save it if the article still exists. */
export async function enrichArticle(id, url) {
  const title = await fetchPageTitle(url);
  if (!title) return;

  try {
    await db.articles.update(id, { title });
  } catch (error) {
    console.error('Could not save the page title', error);
  }
}
