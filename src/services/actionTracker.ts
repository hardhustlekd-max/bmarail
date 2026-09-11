/**
 * Global Action & Async Operation Tracker for Navbar Loader
 * Tracks in-flight async operations (saving, syncing, deleting, approving, navigation, uploads)
 * and notifies UI components (Navbar, Header, etc.) in real-time.
 */

export interface ActionState {
  isLoading: boolean;
  activeCount: number;
  labelAm: string;
  labelEn: string;
  timestamp: number;
}

type ActionSubscriber = (state: ActionState) => void;

const subscribers = new Set<ActionSubscriber>();

let activeCount = 0;
let currentLabelAm = '';
let currentLabelEn = '';
let lastActionTime = Date.now();

export function subscribeActionLoading(callback: ActionSubscriber): () => void {
  callback({
    isLoading: activeCount > 0,
    activeCount,
    labelAm: currentLabelAm,
    labelEn: currentLabelEn,
    timestamp: lastActionTime,
  });
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

function notifySubscribers() {
  const state: ActionState = {
    isLoading: activeCount > 0,
    activeCount,
    labelAm: currentLabelAm,
    labelEn: currentLabelEn,
    timestamp: lastActionTime,
  };
  subscribers.forEach((cb) => {
    try {
      cb(state);
    } catch (e) {
      console.error('Error in action subscriber:', e);
    }
  });
}

/**
 * Start tracking an action by ID with optional labels
 */
export function startGlobalAction(
  actionId?: string,
  labelAm: string = 'እየተከናወነ ነው...',
  labelEn: string = 'Processing action...',
  maxDurationMs: number = 6000
): () => void {
  activeCount++;
  currentLabelAm = labelAm;
  currentLabelEn = labelEn;
  lastActionTime = Date.now();
  notifySubscribers();

  let ended = false;
  const timeoutId = setTimeout(() => {
    if (!ended) {
      ended = true;
      endGlobalAction();
    }
  }, maxDurationMs);

  return () => {
    if (!ended) {
      ended = true;
      clearTimeout(timeoutId);
      endGlobalAction();
    }
  };
}

/**
 * End tracking an action
 */
export function endGlobalAction() {
  activeCount = Math.max(0, activeCount - 1);
  if (activeCount === 0) {
    currentLabelAm = '';
    currentLabelEn = '';
  }
  lastActionTime = Date.now();
  notifySubscribers();
}

/**
 * Helper to wrap any async function with the global action loader
 */
export async function trackGlobalAction<T>(
  asyncFn: () => Promise<T>,
  labelAm: string = 'እየተከናወነ ነው...',
  labelEn: string = 'Processing action...'
): Promise<T> {
  const end = startGlobalAction(undefined, labelAm, labelEn);
  try {
    return await asyncFn();
  } finally {
    end();
  }
}

/**
 * Trigger a brief navbar action pulse (useful for fast client-side navigations)
 */
export function pulseNavbarLoader(
  labelAm: string = 'ገፁ እየተጫነ ነው...',
  labelEn: string = 'Loading view...',
  durationMs: number = 400
) {
  const end = startGlobalAction(undefined, labelAm, labelEn);
  setTimeout(() => {
    end();
  }, durationMs);
}
