import type { ExpoConfig } from 'expo/config';

import appInfo from './src/constants/appInfo.json';

const config: ExpoConfig = {
  name: appInfo.name,
  slug: appInfo.slug,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: appInfo.scheme,
  userInterfaceStyle: 'automatic',
  android: {
    // Placeholder application ID — finalize before any real release build or store submission.
    package: 'com.splitsy.mvp',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-sqlite',
    'expo-file-system',
    'expo-image',
    [
      'expo-camera',
      {
        cameraPermission: 'Splitsy uses your camera only to photograph the receipt.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Splitsy needs access to your photos so you can choose a receipt image.',
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        // Matches the theme's light/dark `background` tokens (src/theme/tokens.ts)
        // so the splash screen doesn't flash a mismatched color before the app's
        // own ThemeProvider takes over.
        backgroundColor: '#F5F6FA',
        image: './assets/images/splash-icon.png',
        imageWidth: 160,
        dark: {
          backgroundColor: '#0B0D12',
          image: './assets/images/splash-icon.png',
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: 'dd4a22ce-daf0-49cd-9c72-582641502dbc',
    },
  },
};

export default config;
