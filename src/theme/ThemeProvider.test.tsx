import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, waitFor } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Text } from 'react-native';

import { ThemeProvider, useTheme } from './ThemeProvider';
import { darkColors, lightColors } from './tokens';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

const STORAGE_KEY = 'splitsy.themePreference';

// Records every scheme the provider ever renders children with, so a
// single wrong-palette frame would show up.
const renderedSchemes: string[] = [];

function Probe() {
  const { scheme, colors } = useTheme();
  renderedSchemes.push(scheme);
  return <Text testID="probe">{`${scheme}:${colors.background}`}</Text>;
}

beforeEach(async () => {
  renderedSchemes.length = 0;
  jest.mocked(SplashScreen.hideAsync).mockClear();
  await AsyncStorage.clear();
});

describe('ThemeProvider launch hydration', () => {
  it('never renders the dark palette for a user with a saved Light preference', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'light');

    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(await screen.findByTestId('probe')).toHaveTextContent(`light:${lightColors.background}`);
    expect(renderedSchemes).not.toContain('dark');
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });

  it('defaults to dark when no preference is stored', async () => {
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(await screen.findByTestId('probe')).toHaveTextContent(`dark:${darkColors.background}`);
    expect(renderedSchemes).not.toContain('light');
  });

  it('still renders and releases the splash when storage fails', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('unavailable'));

    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(await screen.findByTestId('probe')).toHaveTextContent(`dark:${darkColors.background}`);
    await waitFor(() => expect(SplashScreen.hideAsync).toHaveBeenCalled());
  });
});
