<script>
  import Icon from './Icon.svelte';
  import {
    fallbackTitle,
    faviconFor,
    formatSavedDate,
    hostnameOf,
    isHttpUrl,
  } from '../utils.js';

  let { article, now = Date.now(), onToggleStatus, onDelete } = $props();

  let faviconFailed = $state(false);

  const read = $derived(article.status === 'read');
  const title = $derived(article.title?.trim() || fallbackTitle(article.url));
  const hostname = $derived(hostnameOf(article.url));
  const savedDate = $derived(formatSavedDate(article.createdAt, now));
  const safe = $derived(isHttpUrl(article.url));
  const favicon = $derived(faviconFor(article.url));
  const initial = $derived((hostname || '?').charAt(0).toUpperCase());
</script>

<article
  class="group relative flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-4 transition-all duration-200 hover:border-neutral-300 hover:shadow-[0_2px_16px_-8px_rgba(0,0,0,0.15)] dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700 dark:hover:shadow-[0_2px_20px_-8px_rgba(255,255,255,0.08)] sm:gap-4 sm:px-5"
>
  <button
    type="button"
    class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors {read
      ? 'border-orange-600 bg-orange-600 text-white dark:border-orange-500 dark:bg-orange-500'
      : 'border-neutral-400 text-transparent hover:border-orange-600 hover:text-orange-600/30 dark:border-neutral-500 dark:hover:border-orange-500 dark:hover:text-orange-500/30'}"
    onclick={() => onToggleStatus(article.id, read ? 'unread' : 'read')}
    aria-label={read ? `Mark “${title}” as unread` : `Mark “${title}” as read`}
    aria-pressed={read}
  >
    <Icon name="check" size={13} strokeWidth={3.2} />
  </button>

  <svelte:element
    this={safe ? 'a' : 'div'}
    href={safe ? article.url : undefined}
    target={safe ? '_blank' : undefined}
    rel={safe ? 'noopener noreferrer' : undefined}
    class="flex min-w-0 flex-1 items-start gap-3 sm:gap-3.5 {safe ? 'cursor-pointer' : ''}"
  >
    <span
      class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
      aria-hidden="true"
    >
      {#if faviconFailed || !favicon}
        <span class="text-sm font-semibold text-neutral-500 dark:text-neutral-400">
          {initial}
        </span>
      {:else}
        <img
          src={favicon}
          alt=""
          width="20"
          height="20"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          class="h-5 w-5 object-contain"
          onerror={() => (faviconFailed = true)}
        />
      {/if}
    </span>

    <span class="min-w-0 flex-1">
      <span
        class="block font-serif text-[19px] font-medium leading-snug tracking-[-0.01em] transition-colors group-hover:text-orange-700 dark:group-hover:text-orange-400 {read
          ? 'text-neutral-500 dark:text-neutral-400'
          : 'text-neutral-900 dark:text-neutral-100'}"
      >
        {title}
      </span>
      <span class="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-500">
        <span class="truncate">{hostname}</span>
        {#if savedDate}
          <span aria-hidden="true">·</span>
          <span class="shrink-0">{savedDate}</span>
        {/if}
      </span>
    </span>

    {#if safe}
      <span class="sr-only">(opens in a new tab)</span>
      <Icon
        name="external-link"
        size={15}
        className="mt-1.5 hidden shrink-0 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 sm:block dark:text-neutral-600"
      />
    {/if}
  </svelte:element>

  <button
    type="button"
    class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 dark:text-neutral-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
    onclick={() => onDelete(article.id)}
    aria-label={`Delete “${title}”`}
    title="Delete"
  >
    <Icon name="trash" size={16} />
  </button>
</article>
