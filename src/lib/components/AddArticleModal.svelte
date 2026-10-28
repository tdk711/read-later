<script>
  import { cubicOut } from 'svelte/easing';
  import { fade, scale } from 'svelte/transition';
  import { db, addArticle } from '../db.js';
  import { normaliseUrl } from '../utils.js';
  import Icon from './Icon.svelte';

  let { onClose, onAdded } = $props();

  let value = $state('');
  let error = $state('');
  let saving = $state(false);

  function focusOnMount(node) {
    requestAnimationFrame(() => node.focus());
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') onClose();
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;

    error = '';
    const url = normaliseUrl(value);

    if (!url) {
      error = 'That does not look like a valid link. Try something like example.com/article.';
      return;
    }

    saving = true;

    try {
      const existing = await db.articles.where('url').equals(url).first();

      if (existing) {
        if (existing.status === 'read') {
          await db.articles.update(existing.id, { status: 'unread' });
          onClose();
        } else {
          error = 'This link is already in your unread list.';
          saving = false;
        }
        return;
      }

      const id = await addArticle(url);
      onAdded(id, url);
      onClose();
    } catch (cause) {
      console.error('Could not save article', cause);
      error = 'Could not save that link. Please try again.';
      saving = false;
    }
  }

  $effect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-6">
  <div
    class="absolute inset-0 bg-neutral-950/40 backdrop-blur-[2px]"
    transition:fade={{ duration: 150 }}
    onclick={onClose}
    role="presentation"
  ></div>

  <div
    class="relative w-full max-w-lg overflow-hidden rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl shadow-neutral-950/10 sm:p-7 dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-black"
    transition:scale={{ start: 0.97, duration: 180, easing: cubicOut }}
    role="dialog"
    aria-modal="true"
    aria-labelledby="add-link-title"
  >
    <div class="flex items-start justify-between gap-4">
      <div>
        <h2
          id="add-link-title"
          class="font-serif text-2xl font-medium tracking-tight text-neutral-900 dark:text-white"
        >
          Save a link
        </h2>
        <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Paste a URL and we'll take care of the rest.
        </p>
      </div>
      <button
        type="button"
        class="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-900 dark:hover:text-white"
        onclick={onClose}
        aria-label="Close"
      >
        <Icon name="x" size={18} />
      </button>
    </div>

    <form class="mt-6" onsubmit={submit}>
      <label for="article-url" class="sr-only">Link to save</label>
      <div class="relative">
        <span
          class="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-neutral-400 dark:text-neutral-500"
        >
          <Icon name="link" size={18} />
        </span>
        <input
          id="article-url"
          use:focusOnMount
          bind:value
          oninput={() => (error = '')}
          type="text"
          inputmode="url"
          maxlength="2048"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="https://example.com/good-read"
          class="h-12 w-full rounded-2xl border border-neutral-200 bg-neutral-50 pl-11 pr-4 text-[15px] text-neutral-900 placeholder:text-neutral-500 transition focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-brand-500 dark:focus:bg-neutral-900"
        />
      </div>

      <div class="mt-2 min-h-5 px-1">
        {#if error}
          <p class="text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>
        {:else}
          <p class="text-xs text-neutral-500 dark:text-neutral-500">
            Works with any http or https link.
          </p>
        {/if}
      </div>

      <div class="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          class="h-10 rounded-full px-4 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white"
          onclick={onClose}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          class="inline-flex h-10 items-center gap-2 rounded-full bg-brand-700 px-5 text-sm font-semibold text-white shadow-sm shadow-brand-700/20 transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {#if saving}
            <svg
              class="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
              ></path>
            </svg>
            Saving
          {:else}
            Save link
          {/if}
        </button>
      </div>
    </form>
  </div>
</div>
