<script>
  import Icon from './Icon.svelte';

  let { view = 'unread', onAction } = $props();
</script>

<div class="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center sm:py-28">
  <div class="relative mb-7">
    <div class="absolute inset-0 rounded-3xl bg-brand-500/15 blur-2xl" aria-hidden="true"></div>
    <div
      class="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-400 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-500"
    >
      <Icon name={view === 'unread' ? 'inbox' : 'book-open'} size={27} strokeWidth={1.6} />
    </div>
  </div>

  {#if view === 'unread'}
    <h2 class="font-serif text-2xl font-medium tracking-tight text-neutral-900 dark:text-white">
      Nothing saved for later
    </h2>
    <p class="mt-2 max-w-xs text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
      Save a link and it will be waiting here whenever you have a quiet minute.
    </p>
    <button
      type="button"
      class="mt-7 inline-flex items-center gap-2 rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-700/20 transition hover:bg-brand-800 active:scale-[0.98]"
      onclick={onAction}
    >
      Save your first link
      <Icon name="arrow-right" size={16} strokeWidth={2.2} />
    </button>
  {:else}
    <h2 class="font-serif text-2xl font-medium tracking-tight text-neutral-900 dark:text-white">
      No finished reads yet
    </h2>
    <button
      type="button"
      class="mt-7 inline-flex items-center gap-2 rounded-full border border-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
      onclick={onAction}
    >
      Go to unread
      <Icon name="arrow-right" size={16} strokeWidth={2.2} />
    </button>
  {/if}
</div>
