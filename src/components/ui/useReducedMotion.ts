import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

// One app-wide store for the OS "reduce motion" accessibility setting: a
// single initial query plus a single change listener, created lazily the
// first time any component subscribes and shared by every caller (rather
// than one query + listener per button/row instance).
let reduceMotionEnabled = false;
let initialised = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function setReduceMotion(value: boolean) {
  if (value === reduceMotionEnabled) return;
  reduceMotionEnabled = value;
  notify();
}

function ensureInitialised() {
  if (initialised) return;
  initialised = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then(setReduceMotion)
    .catch(() => {
      // Unknown — keep the default (animations on).
    });
  // Lives for the whole app session, so it is intentionally never removed.
  AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
}

function subscribe(listener: () => void) {
  ensureInitialised();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return reduceMotionEnabled;
}

// True while the OS "reduce motion" setting is on. Callers skip their
// (purely decorative) press/selection animations when it's set.
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
