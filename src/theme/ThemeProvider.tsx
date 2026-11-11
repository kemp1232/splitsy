import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { darkColors, lightColors, type ColorTokens } from './tokens';

// Keep the native splash up until the stored appearance preference has been
// read (below), so the first app frame is already in the user's chosen
// palette — no dark→light (or light→dark) flash on launch. Module scope so it
// runs before the first render; no-op on web.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden or unavailable — nothing to hold.
});

// 'system' follows the device's own light/dark setting (useColorScheme);
// 'light'/'dark' are an explicit user override set from Settings and
// persisted across launches (spec-adjacent — see settings.tsx's "Appearance"
// section).
export type ThemePreference = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

type ThemeContextValue = {
  colors: ColorTokens;
  scheme: ColorScheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const STORAGE_KEY = 'splitsy.themePreference';
export const DEFAULT_PREFERENCE: ThemePreference = 'dark';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveScheme(preference: ThemePreference, systemScheme: string | null | undefined): ColorScheme {
  if (preference === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
  return preference;
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  // Dark is the app's default appearance (2026-11 redesign), used when no
  // preference has been stored.
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_PREFERENCE);
  // False until the stored preference has been read. Children are not
  // rendered before then (the native splash covers this on device), so no
  // frame is ever drawn in the wrong palette.
  const [hydrated, setHydrated] = useState(false);

  // Reads the persisted override once on mount. No stored value (first
  // launch, or storage unavailable) leaves the default ('dark') in place.
  // Always finishes by marking hydrated and releasing the splash, so a
  // storage failure can never leave the app stuck on the splash.
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (isThemePreference(stored)) {
          setPreferenceState(stored);
        }
      } catch {
        // Storage unavailable — the in-memory default stands for this session.
      } finally {
        setHydrated(true);
        SplashScreen.hideAsync().catch(() => {
          // Already hidden — nothing to do.
        });
      }
    })();
  }, []);

  function setPreference(next: ThemePreference) {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Best-effort persistence — the choice still applies for this session
      // even if saving it for next launch fails.
    });
  }

  const scheme = resolveScheme(preference, systemScheme);
  const colors = scheme === 'dark' ? darkColors : lightColors;

  const value = useMemo<ThemeContextValue>(
    () => ({ colors, scheme, preference, setPreference }),
    [colors, scheme, preference],
  );

  if (!hydrated) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
