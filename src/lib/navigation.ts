import type { useRouter } from 'expo-router';

type BackRouter = Pick<ReturnType<typeof useRouter>, 'canGoBack' | 'back' | 'dismissTo'>;

// The app's one "back" behaviour for screens without a special case: the
// previous screen when there is one in the stack, otherwise Home (e.g. a web
// tab reloaded straight onto this screen, or a draft resumed from a cold
// start). Used by ScreenHeader's default back button and the camera's close
// button.
export function goBackOrHome(router: BackRouter): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.dismissTo('/');
  }
}
