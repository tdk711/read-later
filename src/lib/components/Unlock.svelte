<script>
  import { isValidPin, unlock, PIN_MIN_LENGTH } from '../auth.js';
  import Icon from './Icon.svelte';

  let { onUnlocked = () => {}, initialError = '' } = $props();

  let pin = $state('');
  let remember = $state(false);
  let showPin = $state(false);
  let busy = $state(false);
  let errorMessage = $state('');

  // Keep the parent-provided error (for example after a rejected stored token)
  // visible without overwriting errors produced by this form.
  $effect(() => {
    if (initialError) errorMessage = initialError;
  });

  const valid = $derived(isValidPin(pin));

  function clearError() {
    if (errorMessage) errorMessage = '';
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;

    if (!isValidPin(pin)) {
      errorMessage = `Use at least ${PIN_MIN_LENGTH} characters with both letters and numbers.`;
      return;
    }

    errorMessage = '';
    busy = true;

    try {
      await unlock(pin, { remember });
      pin = '';
      onUnlocked();
    } catch (error) {
      errorMessage = error?.message || 'Could not unlock. Please try again.';
    } finally {
      busy = false;
    }
  }
</script>

<div
  class="flex h-dvh items-center justify-center overflow-y-auto overflow-x-hidden bg-white px-4 py-10 text-neutral-900 scrollbar-none dark:bg-black dark:text-neutral-100"
>
  <div class="w-full max-w-sm">
    <div class="mb-8 flex flex-col items-center text-center">
      <div
        class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm shadow-brand-600/25"
      >
        <Icon name="bookmark" size={22} strokeWidth={2} />
      </div>
      <h1 class="mt-4 font-serif text-3xl font-medium tracking-tight">Read It Later</h1>
      <p class="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
        Your private library, synced across your devices.
      </p>
    </div>

    <div
      class="rounded-3xl border border-neutral-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)] dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-black/60"
    >
      <div class="flex items-center gap-2">
        <span
          class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
        >
          <Icon name="lock" size={16} strokeWidth={2} />
        </span>
        <h2 class="font-serif text-xl font-medium tracking-tight">Enter your PIN</h2>
      </div>

      <p class="mt-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
        The same PIN unlocks this library on every device. It never leaves your browser.
      </p>

      <form class="mt-5" onsubmit={submit}>
        <label class="block" for="unlock-pin">
          <span class="text-xs font-medium text-neutral-600 dark:text-neutral-400">PIN</span>
          <div class="relative mt-1.5">
            <input
              id="unlock-pin"
              type={showPin ? 'text' : 'password'}
              bind:value={pin}
              oninput={clearError}
              autocomplete="current-password"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              maxlength="64"
              placeholder="Letters and numbers"
              class="h-11 w-full rounded-2xl border border-neutral-200 bg-neutral-50 pl-4 pr-12 text-[15px] tracking-wide text-neutral-900 placeholder:tracking-normal placeholder:text-neutral-400 transition focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-brand-500 dark:focus:bg-neutral-900"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-2xl text-neutral-400 transition hover:text-neutral-700 dark:hover:text-neutral-200"
              onclick={() => (showPin = !showPin)}
              aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
              title={showPin ? 'Hide PIN' : 'Show PIN'}
            >
              <Icon name={showPin ? 'eye-off' : 'eye'} size={18} />
            </button>
          </div>
        </label>

        <p class="mt-2 px-1 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-500">
          {PIN_MIN_LENGTH}+ characters, with at least one letter and one number.
        </p>

        <label
          class="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-neutral-200 px-3 py-2.5 transition hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700"
        >
          <input
            type="checkbox"
            bind:checked={remember}
            class="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-brand-600 focus:ring-brand-500/30 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span class="min-w-0">
            <span class="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Trust this device
            </span>
            <span class="block text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-500">
              Stay unlocked after closing the browser. The derived token is stored on this device;
              the PIN itself is never saved.
            </span>
          </span>
        </label>

        {#if errorMessage}
          <p
            class="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
            role="alert"
          >
            {errorMessage}
          </p>
        {/if}

        <button
          type="submit"
          disabled={busy || !valid}
          class="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-5 text-sm font-semibold text-white shadow-sm shadow-brand-700/20 transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {#if busy}
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
            Unlocking
          {:else}
            Unlock library
            <Icon name="unlock" size={16} strokeWidth={2} />
          {/if}
        </button>
      </form>
    </div>

    <p class="mt-6 text-center text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-500">
      There is no account and no password reset. Keep your PIN somewhere safe.
    </p>
  </div>
</div>
