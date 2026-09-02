import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Keeping an installed copy up to date.
 *
 * A precached shell that can never update is worse than no cache at all: it
 * pins whoever installed it to whatever build they happened to get. So the
 * service worker registers in prompt mode and the app asks before reloading —
 * mid-tune is not the moment to swap the code out from under someone.
 */
export interface ServiceWorkerState {
  updateReady: boolean;
  offlineReady: boolean;
  update: () => void;
  dismiss: () => void;
}

export function useServiceWorker(): ServiceWorkerState {
  const [updateReady, setUpdateReady] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [apply, setApply] = useState<(() => void) | null>(null);

  useEffect(() => {
    const update = registerSW({
      onNeedRefresh() {
        setUpdateReady(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
    });
    setApply(() => () => void update(true));
  }, []);

  return {
    updateReady,
    offlineReady,
    update: () => apply?.(),
    dismiss: () => {
      setUpdateReady(false);
      setOfflineReady(false);
    },
  };
}

/**
 * Hold the screen awake while the band plays.
 *
 * A chart that blanks halfway through a tune is useless on a stand, and the
 * lock has to be re-taken when the tab comes back — browsers drop it on any
 * visibility change.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    // Not available everywhere, and never on http. Its absence is not an error.
    const wakeLock = navigator.wakeLock;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const take = async () => {
      try {
        sentinel = await wakeLock.request('screen');
      } catch {
        // Denied, or the document is hidden. Nothing to do but let the screen sleep.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !released) void take();
    };

    void take();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
