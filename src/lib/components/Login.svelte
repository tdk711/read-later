<script>
  import { db, currentUser, userInteraction } from '../db.js';
  import Icon from './Icon.svelte';

  let email = $state('');
  let values = $state({});
  let busy = $state(false);
  let errorMessage = $state('');
  let lastInteraction = null;

  const interaction = $derived($userInteraction);
  const user = $derived($currentUser);

  // Reset the field values whenever Dexie Cloud swaps to a new prompt
  // (email -> OTP -> error alert, for example).
  $effect(() => {
    const current = interaction;
    if (current === lastInteraction) return;
    lastInteraction = current;
    busy = false;

    const next = {};
    for (const name of Object.keys(current?.fields ?? {})) next[name] = '';
    values = next;
  });

  function fieldLabel(name, field) {
    if (field.label) return field.label;
    if (name === 'email') return 'Email address';
    if (name === 'otp') return 'One-time code';
    return name;
  }

  function alertClass(type) {
    if (type === 'error') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300';
    if (type === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300';
    return 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300';
  }

  async function startLogin(event) {
    event.preventDefault();
    if (busy) return;

    const address = email.trim();
    if (!address) {
      errorMessage = 'Enter your email address first.';
      return;
    }

    errorMessage = '';
    busy = true;

    try {
      // Drives Dexie Cloud's built-in email OTP flow. The OTP prompt itself
      // arrives through `db.cloud.userInteraction` and is rendered below.
      await db.cloud.login({ email: address });
    } catch (error) {
      // Closing the prompt rejects the promise; that is not a real failure.
      if (error?.name !== 'AbortError') {
        errorMessage = error?.message || 'Could not sign in. Please try again.';
      }
    } finally {
      busy = false;
    }
  }

  function submitInteraction(event) {
    event.preventDefault();
    if (!interaction || busy) return;

    busy = true;
    errorMessage = '';

    const params = {};
    for (const [name, value] of Object.entries(values)) {
      if (name === 'email') params[name] = value.trim().toLowerCase();
      else if (name === 'otp') params[name] = value.trim().toUpperCase();
      else params[name] = value;
    }

    interaction.onSubmit(params);
  }

  function selectOption(option) {
    if (busy) return;
    busy = true;
    interaction?.onSubmit({ [option.name]: option.value });
  }
</script>

<div
  class="flex min-h-dvh items-center justify-center bg-white px-4 py-10 text-neutral-900 dark:bg-black dark:text-neutral-100"
>
  <div class="w-full max-w-sm">
    <div class="mb-8 flex flex-col items-center text-center">
      <div
        class="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-sm shadow-orange-600/25"
      >
        <Icon name="bookmark" size={22} strokeWidth={2} />
      </div>
      <h1 class="mt-4 font-serif text-3xl font-medium tracking-tight">Read It Later</h1>
      <p class="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
        A quiet place for the things you want to come back to.
      </p>
    </div>

    <div
      class="rounded-3xl border border-neutral-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)] dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-black/60"
    >
      {#if interaction}
        <h2 class="font-serif text-xl font-medium tracking-tight">
          {interaction.title || 'Sign in'}
        </h2>

        {#if interaction.alerts?.length}
          <div class="mt-4 space-y-2">
            {#each interaction.alerts as alert}
              <p
                class="rounded-xl border px-3 py-2 text-xs leading-relaxed {alertClass(alert.type)}"
                role={alert.type === 'error' ? 'alert' : 'status'}
              >
                {alert.message}
              </p>
            {/each}
          </div>
        {/if}

        {#if interaction.options?.length}
          <div class="mt-5 space-y-2">
            {#each interaction.options as option (option.name + option.value)}
              <button
                type="button"
                class="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-neutral-200 px-4 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
                disabled={busy}
                onclick={() => selectOption(option)}
              >
                {#if option.iconUrl}
                  <img src={option.iconUrl} alt="" class="h-4 w-4" />
                {/if}
                {option.displayName}
              </button>
            {/each}
          </div>
        {/if}

        <form class="mt-5" onsubmit={submitInteraction}>
          {#each Object.entries(interaction.fields ?? {}) as [name, field] (name)}
            <label class="block" for={`login-${name}`}>
              <span class="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                {fieldLabel(name, field)}
              </span>
              <input
                id={`login-${name}`}
                type={field.type === 'otp' ? 'text' : field.type === 'password' ? 'password' : 'email'}
                inputmode={field.type === 'otp' ? 'numeric' : undefined}
                autocomplete={field.type === 'otp' ? 'one-time-code' : 'email'}
                autocapitalize="off"
                spellcheck="false"
                maxlength={field.type === 'otp' ? '8' : '254'}
                placeholder={field.placeholder ?? ''}
                bind:value={values[name]}
                class="mt-1.5 h-11 w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 text-[15px] text-neutral-900 placeholder:text-neutral-400 transition focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-orange-500 dark:focus:bg-neutral-900"
              />
            </label>
          {/each}

          <button
            type="submit"
            disabled={busy}
            class="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-orange-700 px-5 text-sm font-semibold text-white shadow-sm shadow-orange-700/20 transition hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-60"
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
              Working
            {:else}
              {interaction.submitLabel || 'Continue'}
            {/if}
          </button>

          {#if interaction.cancelLabel}
            <button
              type="button"
              class="mt-2 h-10 w-full rounded-full text-sm font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white"
              onclick={() => interaction.onCancel()}
            >
              {interaction.cancelLabel}
            </button>
          {/if}
        </form>
      {:else}
        <h2 class="font-serif text-xl font-medium tracking-tight">Sign in</h2>
        <p class="mt-1.5 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
          Enter your email and we'll send you a one-time code. No password needed.
        </p>

        <form class="mt-5" onsubmit={startLogin}>
          <label class="block" for="login-email">
            <span class="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Email address
            </span>
            <input
              id="login-email"
              type="email"
              bind:value={email}
              oninput={() => (errorMessage = '')}
              autocomplete="email"
              autocapitalize="off"
              spellcheck="false"
              maxlength="254"
              placeholder="you@example.com"
              class="mt-1.5 h-11 w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 text-[15px] text-neutral-900 placeholder:text-neutral-400 transition focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-orange-500 dark:focus:bg-neutral-900"
            />
          </label>

          {#if errorMessage}
            <p class="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300" role="alert">
              {errorMessage}
            </p>
          {/if}

          <button
            type="submit"
            disabled={busy}
            class="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-orange-700 px-5 text-sm font-semibold text-white shadow-sm shadow-orange-700/20 transition hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-60"
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
              Sending code
            {:else}
              Send sign-in code
            {/if}
          </button>
        </form>
      {/if}
    </div>

    <p class="mt-6 text-center text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-500">
      {user.email
        ? `Signing in as ${user.email}`
        : 'Your links stay private and sync across your signed-in devices.'}
    </p>
  </div>
</div>
