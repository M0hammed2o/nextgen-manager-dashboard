/**
 * Safe, three-tier storage for auth values (`access_token`, `refresh_token`,
 * `auth_user`).
 *
 * Why this exists: Safari (notably on iPad, and worse under certain privacy /
 * storage-partitioning settings or when the app is installed to the home
 * screen) can throw on `localStorage.setItem`/`getItem`/`removeItem`, or
 * silently restrict it. A plain `localStorage.setItem(...)` in the login
 * flow can therefore throw an uncaught exception that looks, from the UI,
 * like a failed login — even though credentials and the backend were both
 * fine. See KNOWN_BUGS.md for the related BUG-0002 (SSE absolute-URL
 * pattern) and BUG-0010 (key/id-regeneration pattern) classes of bug this
 * module must not reintroduce: every access here is wrapped so it can never
 * throw up into caller code, and keys are never derived from anything that
 * changes live.
 *
 * Fallback chain, per key, tried in this order:
 *   1. localStorage  (preferred — persists across tabs/restarts)
 *   2. sessionStorage (persists for the tab's lifetime)
 *   3. in-memory Map (always available, cleared on full reload)
 *
 * Tier selection is attempted fresh on every write (so a tier that starts
 * working again is used again), and the tier that actually succeeded is
 * remembered per key so that a *read* of that key consistently goes back to
 * the same tier first, rather than mixing results from different tiers for
 * what should be one logical value. If the remembered tier itself throws on
 * a later read (e.g. it stopped working mid-session), the read falls through
 * the same probe chain and re-remembers whichever tier actually answered.
 *
 * `removeItem` clears a key from ALL THREE tiers unconditionally, regardless
 * of which tier is currently remembered — this matters for logout, which
 * must not leave a stale value behind in a tier that was in use earlier in
 * the session (e.g. localStorage worked at login time, then a later request
 * only partially cleared it).
 */

type Tier = 'local' | 'session' | 'memory';

/** Thrown only when every tier — including the in-memory fallback — fails. */
export class AuthStorageError extends Error {
  constructor(message = "Couldn't save your session on this device. Please try again.") {
    super(message);
    this.name = 'AuthStorageError';
  }
}

export class AuthStorage {
  private memoryStore = new Map<string, string>();
  private tierForKey = new Map<string, Tier>();

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
      this.tierForKey.set(key, 'local');
      return;
    } catch {
      /* localStorage unavailable/throwing — fall through to sessionStorage */
    }
    try {
      sessionStorage.setItem(key, value);
      this.tierForKey.set(key, 'session');
      return;
    } catch {
      /* sessionStorage unavailable/throwing — fall through to memory */
    }
    try {
      this.memoryStore.set(key, value);
      this.tierForKey.set(key, 'memory');
    } catch {
      // Should be essentially unreachable (a plain in-memory Map.set
      // failing implies something catastrophic, e.g. out of memory) — but
      // handle it defensively rather than letting an exception escape
      // into the login flow, where it could be mistaken for bad
      // credentials.
      throw new AuthStorageError();
    }
  }

  getItem(key: string): string | null {
    const remembered = this.tierForKey.get(key);

    if (remembered === 'local') {
      try {
        return localStorage.getItem(key);
      } catch {
        /* fall through to the full probe below */
      }
    } else if (remembered === 'session') {
      try {
        return sessionStorage.getItem(key);
      } catch {
        /* fall through to the full probe below */
      }
    } else if (remembered === 'memory') {
      return this.memoryStore.has(key) ? (this.memoryStore.get(key) as string) : null;
    }

    // No remembered tier, or the remembered tier just failed — probe in
    // priority order and remember whichever tier actually answers.
    try {
      const value = localStorage.getItem(key);
      this.tierForKey.set(key, 'local');
      return value;
    } catch {
      /* fall through */
    }
    try {
      const value = sessionStorage.getItem(key);
      this.tierForKey.set(key, 'session');
      return value;
    } catch {
      /* fall through */
    }
    this.tierForKey.set(key, 'memory');
    return this.memoryStore.has(key) ? (this.memoryStore.get(key) as string) : null;
  }

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore — nothing to clear there */
    }
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore — nothing to clear there */
    }
    this.memoryStore.delete(key);
    this.tierForKey.delete(key);
  }
}

/** Shared instance used by `auth.tsx` and `api-client.ts`. */
export const authStorage = new AuthStorage();
