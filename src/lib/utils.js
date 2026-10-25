/**
 * Normalise user input into a safe absolute http(s) URL.
 * Returns null when the value cannot be a web link.
 */
export function normaliseUrl(value) {
  if (typeof value !== 'string') return null;

  let candidate = value.trim();
  if (!candidate) return null;

  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate);
  const looksLikeHostPort = /^[^/:]+:\d+(\/|$)/.test(candidate);

  // Reject non-web schemes such as mailto: or javascript:, but allow host:port.
  if (hasScheme) {
    if (!/^https?:\/\//i.test(candidate)) return null;
  } else if (/^[a-z][a-z\d+.-]*:/i.test(candidate) && !looksLikeHostPort) {
    return null;
  } else {
    candidate = `https://${candidate}`;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || !url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Guard against unsafe URLs that might have found their way into storage. */
export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function hostnameOf(value) {
  try {
    return new URL(value).hostname.replace(/^www\./i, '');
  } catch {
    return value;
  }
}

/** A readable title used until (or if) the page metadata is fetched. */
export function fallbackTitle(value) {
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    let slug = segments.at(-1) ?? '';

    if (segments.length && /^[\w-]+\.(html?|php|aspx?|jsp)$/i.test(slug)) {
      slug = slug.replace(/\.[a-z]+$/i, '');
    }

    let title = '';
    try {
      title = decodeURIComponent(slug);
    } catch {
      title = slug;
    }

    title = title
      .replace(/[-_+]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (title.length > 1 && !/^\d+$/.test(title)) {
      return title.charAt(0).toUpperCase() + title.slice(1).slice(0, 180);
    }

    return url.hostname.replace(/^www\./i, '');
  } catch {
    return 'Untitled link';
  }
}

export function faviconFor(value) {
  try {
    const hostname = new URL(value).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  } catch {
    return '';
  }
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** Short, friendly timestamp for when a link was saved. */
export function formatSavedDate(timestamp, now = Date.now()) {
  if (!Number.isFinite(timestamp)) return '';

  const delta = timestamp - now;
  const absolute = Math.abs(delta);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (absolute < minute) return 'Just now';
  if (absolute < hour) return relative.format(Math.round(delta / minute), 'minute');
  if (absolute < day) return relative.format(Math.round(delta / hour), 'hour');
  if (absolute < week) return relative.format(Math.round(delta / day), 'day');

  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
