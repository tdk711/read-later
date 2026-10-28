<script>
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import {
    articles,
    currentUser,
    db,
    deleteArticle,
    migrateLegacyArticles,
    pullFromCloud,
    setArticleStatus,
    signOut,
  } from './lib/db.js';
  import { enrichArticle } from './lib/metadata.js';
  import Sidebar from './lib/components/Sidebar.svelte';
  import ArticleCard from './lib/components/ArticleCard.svelte';
  import EmptyState from './lib/components/EmptyState.svelte';
  import AddArticleModal from './lib/components/AddArticleModal.svelte';
  import Login from './lib/components/Login.svelte';
  import Icon from './lib/components/Icon.svelte';

  // 'loading' while Dexie restores the session, 'login' when signed out,
  // 'syncing' during the initial pull, then 'ready'.
  let phase = $state('loading');
  let bootError = $state('');
  let syncWarning = $state('');
  let activeUserId = null;
  let signingOut = $state(false);

  let view = $state('unread');
  let sidebarCollapsed = $state(initialSidebarCollapsed());
  let mobileOpen = $state(false);
  let addOpen = $state(false);
  let theme = $state(initialTheme());
  let now = $state(Date.now());
  let isMobile = $state(false);
  let scrollContainer = $state(null);

  function initialTheme() {
    if (typeof document === 'undefined') return 'light';
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }

  function initialSidebarCollapsed() {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  }

  const unread = $derived($articles.filter((article) => article.status === 'unread'));
  const read = $derived($articles.filter((article) => article.status === 'read'));
  const visible = $derived(view === 'unread' ? unread : read);

  const countLabel = $derived.by(() => {
    if (view === 'unread') {
      if (unread.length === 0) return 'All caught up';
      return `${unread.length} ${unread.length === 1 ? 'article' : 'articles'}`;
    }
    if (read.length === 0) return '0 articles finished';
    return `${read.length} ${read.length === 1 ? 'article' : 'articles'} read`;
  });

  // Gate the whole app on Dexie Cloud's session. Once a user is signed in,
  // finish the initial pull before showing the list so it is never partial.
  $effect(() => {
    const user = $currentUser;

    if (user.isLoading) return;

    if (!user.isLoggedIn) {
      activeUserId = null;
      phase = 'login';
      return;
    }

    if (activeUserId === user.userId) return;
    activeUserId = user.userId;
    startSession(user.userId);
  });

  async function startSession(userId) {
    phase = 'syncing';
    bootError = '';
    syncWarning = '';

    try {
      await pullFromCloud();
      await migrateLegacyArticles();

      if (activeUserId === userId) phase = 'ready';
    } catch (error) {
      console.error('Could not sync with Dexie Cloud', error);

      if (activeUserId !== userId) return;

      // A returning user who is offline should still get their cached list.
      if (db.cloud.schema) {
        syncWarning = 'Offline — showing the copy saved on this device.';
        phase = 'ready';
      } else {
        bootError = error?.message || 'Could not reach Dexie Cloud.';
        phase = 'error';
      }
    }
  }

  function retrySession() {
    if (activeUserId) startSession(activeUserId);
  }

  async function handleSignOut() {
    if (signingOut) return;
    signingOut = true;

    try {
      await signOut();
    } catch (error) {
      console.error('Could not sign out', error);
    } finally {
      signingOut = false;
    }
  }

  onMount(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const updateMobile = () => {
      isMobile = mobileQuery.matches;
      if (!isMobile) mobileOpen = false;
    };

    updateMobile();
    mobileQuery.addEventListener('change', updateMobile);

    const ticker = setInterval(() => {
      now = Date.now();
    }, 60_000);

    return () => {
      clearInterval(ticker);
      mobileQuery.removeEventListener('change', updateMobile);
    };
  });

  // Retry title lookups for links saved while offline (or when every service failed).
  const attemptedTitles = new Set();

  function fetchTitleOnce(id, url) {
    if (attemptedTitles.has(id)) return;
    attemptedTitles.add(id);
    enrichArticle(id, url);
  }

  $effect(() => {
    for (const article of $articles) {
      if (!article.title?.trim()) fetchTitleOnce(article.id, article.url);
    }
  });

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;

    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Ignore storage failures; the theme still applies for this session.
    }

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff');
  }

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    try {
      localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed));
    } catch {
      // Ignore storage failures.
    }
  }

  function navigate(nextView) {
    view = nextView;
    mobileOpen = false;
    scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function toggleStatus(id, status) {
    try {
      await setArticleStatus(id, status);
    } catch (error) {
      console.error('Could not update article', error);
    }
  }

  async function removeArticle(id) {
    try {
      await deleteArticle(id);
    } catch (error) {
      console.error('Could not delete article', error);
    }
  }

  function handleAdded(id, url) {
    // Show the article immediately, then replace the fallback title with the real one.
    fetchTitleOnce(id, url);
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && !addOpen) mobileOpen = false;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if phase === 'login'}
  <Login />
{:else if phase === 'loading' || phase === 'syncing'}
  <div
    class="flex h-dvh flex-col items-center justify-center gap-4 bg-white px-6 text-neutral-900 dark:bg-black dark:text-neutral-100"
  >
    <div
      class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm shadow-brand-600/25"
    >
      <Icon name="bookmark" size={22} strokeWidth={2} />
    </div>
    <div class="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
      <svg
        class="h-4 w-4 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
        ></path>
      </svg>
      {phase === 'syncing' ? 'Syncing your library…' : 'Opening your library…'}
    </div>
  </div>
{:else if phase === 'error'}
  <div
    class="flex h-dvh flex-col items-center justify-center bg-white px-6 text-center text-neutral-900 dark:bg-black dark:text-neutral-100"
  >
    <div
      class="flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-200 text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"
    >
      <Icon name="globe" size={22} strokeWidth={1.6} />
    </div>
    <h1 class="mt-4 font-serif text-2xl font-medium tracking-tight">Could not sync</h1>
    <p class="mt-2 max-w-sm text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
      {bootError}
    </p>
    <button
      type="button"
      class="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-brand-700 px-5 text-sm font-semibold text-white shadow-sm shadow-brand-700/20 transition hover:bg-brand-800"
      onclick={retrySession}
    >
      Try again
      <Icon name="arrow-right" size={16} strokeWidth={2.2} />
    </button>
  </div>
{:else}
<div class="h-dvh overflow-hidden bg-white text-neutral-900 dark:bg-black dark:text-neutral-100">
  <Sidebar
    {view}
    unreadCount={unread.length}
    readCount={read.length}
    collapsed={sidebarCollapsed}
    {mobileOpen}
    {theme}
    userEmail={$currentUser.email}
    {signingOut}
    inert={isMobile && !mobileOpen}
    onNavigate={navigate}
    onToggleCollapse={toggleSidebar}
    onToggleTheme={toggleTheme}
    onSignOut={handleSignOut}
    onCloseMobile={() => (mobileOpen = false)}
  />

  {#if mobileOpen}
    <button
      type="button"
      class="fixed inset-0 z-30 bg-neutral-950/40 backdrop-blur-sm md:hidden"
      onclick={() => (mobileOpen = false)}
      aria-label="Close menu"
      transition:fade={{ duration: 150 }}
    ></button>
  {/if}

  <div
    class="flex h-full min-h-0 flex-col transition-[margin] duration-300 ease-out {sidebarCollapsed
      ? 'md:ml-[5.5rem]'
      : 'md:ml-64'}"
  >
    <header
      class="z-20 shrink-0 border-b border-neutral-100 bg-white/80 backdrop-blur-xl dark:border-neutral-900 dark:bg-black/80"
    >
      <div class="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-8">
        <button
          type="button"
          class="-ml-2 flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 md:hidden dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white"
          onclick={() => (mobileOpen = true)}
          aria-label="Open menu"
        >
          <Icon name="menu" size={20} />
        </button>

        <div class="min-w-0">
          <h1 class="font-serif text-[26px] font-medium leading-tight tracking-tight">
            {view === 'unread' ? 'Unread' : 'Read'}
          </h1>
          <p
            class="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400"
          >
            {countLabel}
          </p>
        </div>
      </div>
    </header>

    <div bind:this={scrollContainer} class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-none">
      <main class="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-28 pt-5 sm:px-8 sm:pt-6">
        {#if syncWarning}
          <p
            class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
            role="status"
          >
            {syncWarning}
          </p>
        {/if}

        {#if visible.length === 0}
          <EmptyState
            {view}
            onAction={() => (view === 'unread' ? (addOpen = true) : navigate('unread'))}
          />
        {:else}
          <div class="space-y-2.5">
            {#each visible as article (article.id)}
              <div
                animate:flip={{ duration: 250 }}
                in:fly={{ y: 6, duration: 220 }}
                out:fade={{ duration: 140 }}
              >
                <ArticleCard
                  {article}
                  {now}
                  onToggleStatus={toggleStatus}
                  onDelete={removeArticle}
                />
              </div>
            {/each}
          </div>

          <p class="mt-10 text-center text-[11px] text-neutral-500 dark:text-neutral-500">
            Synced privately across your signed-in devices
          </p>
        {/if}
      </main>
    </div>
  </div>

  <button
    type="button"
    class="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700 hover:shadow-xl hover:shadow-brand-600/30 active:scale-95 sm:right-8"
    style="bottom: calc(1.25rem + env(safe-area-inset-bottom));"
    onclick={() => (addOpen = true)}
    aria-label="Add a link"
    title="Add a link"
  >
    <Icon name="plus" size={24} strokeWidth={2.4} />
  </button>

  {#if addOpen}
    <AddArticleModal onClose={() => (addOpen = false)} onAdded={handleAdded} />
  {/if}
</div>
{/if}
