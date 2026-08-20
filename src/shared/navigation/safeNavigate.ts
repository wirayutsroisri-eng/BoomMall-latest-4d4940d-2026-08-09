import { router, type Href } from 'expo-router';
import { useFeedStore } from '@/modules/feed/state/feed-store';

/**
 * Prevents double-tap from stacking screens (esp. fullScreenModal /listen).
 * Locks are synchronous at call time — do NOT wait for async work before locking.
 */

const DEFAULT_LOCK_MS = 1600;

let busyUntil = 0;
let lastHrefKey = '';
/** Keys currently in-flight (sync lock before router.push returns). */
const inFlight = new Set<string>();
/** Screens that report they are mounted (blocks another push of same route). */
const mountedRoutes = new Set<string>();

function hrefKey(href: Href): string {
  if (typeof href === 'string') return href;
  if (href && typeof href === 'object' && 'pathname' in href) {
    const path = String((href as { pathname?: string }).pathname ?? '');
    const params = (href as { params?: Record<string, unknown> }).params;
    return params ? `${path}?${JSON.stringify(params)}` : path;
  }
  return String(href);
}

function routeLeaf(key: string): string {
  // "/listen" | "listen" | "/board-create?..." → listen / board-create
  const path = key.split('?')[0] ?? key;
  const cleaned = path.replace(/^\//, '');
  return cleaned.split('/')[0] || cleaned;
}

function canNavigate(key: string, windowMs = DEFAULT_LOCK_MS): boolean {
  const now = Date.now();
  const leaf = routeLeaf(key);

  if (mountedRoutes.has(leaf) || mountedRoutes.has(key)) {
    return false;
  }
  if (inFlight.has(key) || inFlight.has(leaf)) {
    return false;
  }
  if (now < busyUntil) {
    return false;
  }

  inFlight.add(key);
  inFlight.add(leaf);
  busyUntil = now + windowMs;
  lastHrefKey = key;

  setTimeout(() => {
    inFlight.delete(key);
    inFlight.delete(leaf);
  }, windowMs);

  return true;
}

/** Call from screen mount/unmount so we never push a duplicate modal. */
export function setRouteMounted(route: string, mounted: boolean) {
  const leaf = routeLeaf(route);
  if (mounted) {
    mountedRoutes.add(leaf);
    mountedRoutes.add(route.startsWith('/') ? route : `/${route}`);
  } else {
    mountedRoutes.delete(leaf);
    mountedRoutes.delete(route.startsWith('/') ? route : `/${route}`);
    // Short cooldown after close so a bounce tap doesn't reopen twice
    busyUntil = Math.max(busyUntil, Date.now() + 450);
  }
}

export function isRouteMounted(route: string): boolean {
  const leaf = routeLeaf(route);
  return mountedRoutes.has(leaf) || mountedRoutes.has(route);
}

/**
 * Acquire nav lock immediately (e.g. before await playTrack).
 * Returns false if a second tap should be ignored.
 */
export function acquireNavLock(href: Href, windowMs = DEFAULT_LOCK_MS): boolean {
  return canNavigate(hrefKey(href), windowMs);
}

export function safePush(href: Href): boolean {
  const key = hrefKey(href);
  if (!canNavigate(key)) return false;
  router.push(href);
  return true;
}

export function safeReplace(href: Href): boolean {
  const key = `replace:${hrefKey(href)}`;
  if (!canNavigate(key)) return false;
  router.replace(href);
  return true;
}

/**
 * Open Listen once. Safe to call before/after async audio work.
 * If already open or locked, returns false (no stack).
 */
export function openListenScreen(): boolean {
  if (isRouteMounted('listen')) return false;
  return safePush('/listen');
}

/**
 * Lock + open listen in one shot for double-tap handlers that also await work.
 * Call this FIRST; if false, bail. Then do playTrack / etc.
 */
export function openListenScreenNow(): boolean {
  if (isRouteMounted('listen')) return false;
  if (!acquireNavLock('/listen')) return false;
  // Lock already held — push without re-locking
  router.push('/listen');
  return true;
}

export function openCreateHub(): boolean {
  if (isRouteMounted('create-hub')) return false;
  return safePush('/create-hub');
}

/** Tab สร้าง — กล้อง + คลังรูป/วิดีโอในหน้าเดียว */
export function openCreateCamera(): boolean {
  if (isRouteMounted('create-capture') || isRouteMounted('create-preview')) return false;
  return safePush('/create-capture');
}

export function openBoardCreate(side: 'demand' | 'supply', locked = true): boolean {
  if (isRouteMounted('board-create')) return false;
  return safePush({
    pathname: '/board-create',
    params: { side, locked: locked ? '1' : '0' },
  });
}

/** แท็บกล้อง: หน้าหางาน = รับงาน, ที่อื่น = กล้อง */
export function openCreateFromTab(): boolean {
  if (useFeedStore.getState().tab === 'board') {
    return openBoardCreate('supply');
  }
  return openCreateCamera();
}

/**
 * Facebook Messenger-style: leave the current screen and land in the Chat tab thread.
 * Use `navigate` so product / profile stacks switch to the Chat tab instead of nesting.
 */
export function jumpToChatThread(
  conversationId: string,
  extra?: Record<string, string>,
): boolean {
  if (!conversationId) return false;
  router.navigate({
    pathname: '/(tabs)/chat/[conversationId]',
    params: { conversationId, ...extra },
  });
  return true;
}

export function jumpToChatInbox(): boolean {
  router.navigate('/(tabs)/chat');
  return true;
}

/** @internal test helper */
export function __resetSafeNavigateForTests() {
  busyUntil = 0;
  lastHrefKey = '';
  inFlight.clear();
  mountedRoutes.clear();
}
