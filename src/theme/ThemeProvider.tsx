import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';

import { darkColors, lightColors, type ColorTokens } from './tokens';

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
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  // Reads the persisted override once on mount. No stored value (first
  // launch, or storage unavailable) leaves the default ('system') in place —
  // this is a best-effort read, not a blocking gate on the rest of the app.
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (isThemePreference(stored)) {
          setPreferenceState(stored);
        }
      } catch {
        // Storage unavailable — the in-memory default stands for this session.
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

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
