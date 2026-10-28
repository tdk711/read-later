<script>
  import Icon from './Icon.svelte';

  let {
    view,
    unreadCount = 0,
    readCount = 0,
    collapsed = false,
    mobileOpen = false,
    theme = 'light',
    inert = false,
    userEmail = '',
    signingOut = false,
    onNavigate,
    onToggleCollapse,
    onToggleTheme,
    onSignOut,
    onCloseMobile,
  } = $props();

  const items = [
    { id: 'unread', label: 'Unread', icon: 'inbox' },
    { id: 'read', label: 'Read', icon: 'check-circle' },
  ];

  function countFor(id) {
    return id === 'unread' ? unreadCount : readCount;
  }

  function labelClass() {
    return collapsed ? 'md:hidden' : '';
  }
</script>

<aside
  class="fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-neutral-200 bg-white transition-[width,transform] duration-300 ease-out dark:border-neutral-800 dark:bg-black {mobileOpen
    ? 'translate-x-0'
    : '-translate-x-full'} md:translate-x-0 {collapsed ? 'md:w-[5.5rem]' : 'md:w-64'}"
  aria-label="Main navigation"
  {inert}
>
  <div class="flex h-16 shrink-0 items-center gap-3 px-5">
    <div
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/20"
    >
      <Icon name="bookmark" size={18} strokeWidth={2} />
    </div>
    <span class="truncate font-serif text-xl font-medium tracking-tight {labelClass()}">
      Read It Later
    </span>
    <button
      type="button"
      class="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 md:hidden dark:hover:bg-neutral-900 dark:hover:text-white"
      onclick={onCloseMobile}
      aria-label="Close menu"
    >
      <Icon name="x" size={18} />
    </button>
  </div>

  <button
    type="button"
    class="absolute -right-3 top-[4.5rem] z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 shadow-sm transition-colors hover:border-neutral-300 hover:text-neutral-900 md:flex dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-white"
    onclick={onToggleCollapse}
    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
  >
    <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={13} strokeWidth={2.2} />
  </button>

  <nav class="flex flex-col gap-1 px-3 pt-3">
    {#each items as item (item.id)}
      {@const active = view === item.id}
      <button
        type="button"
        class="group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors {collapsed
          ? 'md:justify-center md:px-0'
          : ''} {active
          ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white'}"
        onclick={() => onNavigate(item.id)}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? `${item.label} (${countFor(item.id)})` : undefined}
      >
        <Icon name={item.icon} size={19} />
        <span class="truncate {labelClass()}">{item.label}</span>
        <span
          class="ml-auto min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums {labelClass()} {active
            ? 'bg-white text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
            : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400'}">{countFor(
            item.id
          )}</span>
      </button>
    {/each}
  </nav>

  <div class="mt-auto border-t border-neutral-100 p-3 dark:border-neutral-900">
    {#if userEmail}
      <p
        class="truncate px-3 pb-1 text-[11px] text-neutral-500 dark:text-neutral-500 {labelClass()}"
        title={userEmail}
      >
        {userEmail}
      </p>
    {/if}

    <button
      type="button"
      class="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 {collapsed
        ? 'md:justify-center md:px-0'
        : ''} dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white"
      onclick={onSignOut}
      disabled={signingOut}
      aria-label="Sign out"
      title={collapsed ? 'Sign out' : undefined}
    >
      <Icon name="log-out" size={19} />
      <span class="{labelClass()}">{signingOut ? 'Signing out…' : 'Sign out'}</span>
    </button>

    <button
      type="button"
      class="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 {collapsed
        ? 'md:justify-center md:px-0'
        : ''} dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white"
      onclick={onToggleTheme}
      aria-label="Dark mode"
      aria-pressed={theme === 'dark'}
      title={collapsed ? 'Toggle dark mode' : undefined}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={19} />
      <span class="{labelClass()}">Dark mode</span>
      <span
        class="ml-auto flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors {labelClass()} {theme ===
        'dark'
          ? 'bg-brand-600'
          : 'bg-neutral-300'}"
        aria-hidden="true"
      >
        <span
          class="h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 {theme ===
          'dark'
            ? 'translate-x-4'
            : 'translate-x-0'}"
        ></span>
      </span>
    </button>
  </div>
</aside>
