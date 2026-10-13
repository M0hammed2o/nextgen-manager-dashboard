import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthStorage } from './auth-storage';

describe('AuthStorage — three-tier fallback for auth values', () => {
  let storage: AuthStorage;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    storage = new AuthStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses localStorage normally when it works (baseline, unchanged behavior)', () => {
    storage.setItem('access_token', 'tok-123');
    expect(localStorage.getItem('access_token')).toBe('tok-123');
    expect(sessionStorage.getItem('access_token')).toBeNull();
    expect(storage.getItem('access_token')).toBe('tok-123');
  });

  it('falls back to sessionStorage when localStorage.setItem throws', () => {
    const realSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (this === localStorage) throw new DOMException('QuotaExceededError');
      // Delegate to the real sessionStorage behavior.
      realSetItem.call(this, key, value);
    });

    storage.setItem('access_token', 'tok-456');

    expect(sessionStorage.getItem('access_token')).toBe('tok-456');
    expect(storage.getItem('access_token')).toBe('tok-456');
  });

  it('falls back to in-memory storage when both localStorage and sessionStorage throw', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });

    storage.setItem('access_token', 'tok-789');

    // Both real storages were never actually written to.
    expect(storage.getItem('access_token')).toBe('tok-789');
  });

  it('reads consistently use whichever storage layer was actually selected, never a mix', () => {
    // localStorage.setItem throws, so the write lands in sessionStorage and
    // 'session' is remembered as the tier for this key.
    const realSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (this === localStorage) throw new DOMException('QuotaExceededError');
      realSetItem.call(this, key, value);
    });
    storage.setItem('access_token', 'tok-session');

    // Directly poke a *different* value straight into localStorage,
    // bypassing the helper, to prove reads don't fall back to checking
    // localStorage first just because it happens to have something in it
    // once the real (unmocked) localStorage.setItem is used below.
    vi.restoreAllMocks();
    localStorage.setItem('access_token', 'tok-local-decoy');

    // The remembered tier for this key is 'session' -- the read must keep
    // returning the session value, not silently pick up the decoy value
    // that now also exists in localStorage.
    expect(storage.getItem('access_token')).toBe('tok-session');
    expect(sessionStorage.getItem('access_token')).toBe('tok-session');
  });

  it('removeItem (logout) clears the value from all three tiers', () => {
    // Populate all three tiers directly so we can prove removeItem doesn't
    // only clear the "currently selected" one.
    localStorage.setItem('access_token', 'a');
    sessionStorage.setItem('access_token', 'b');
    storage.setItem('access_token', 'c'); // lands in localStorage, tier = local

    storage.removeItem('access_token');

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(sessionStorage.getItem('access_token')).toBeNull();
    expect(storage.getItem('access_token')).toBeNull();
  });

  it('removeItem clears the in-memory tier even if both real storages are unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    storage.setItem('refresh_token', 'mem-token');
    expect(storage.getItem('refresh_token')).toBe('mem-token');

    storage.removeItem('refresh_token');

    expect(storage.getItem('refresh_token')).toBeNull();
  });
});
