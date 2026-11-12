// Web counterpart to alert.ts — react-native-web's Alert.alert does nothing,
// so feedback raised through it was silently lost. The browser's own alert
// is the dependency-free equivalent (title and message joined, since it has
// no separate title line).
export function showAlert(title: string, message?: string): void {
  window.alert(message ? `${title}\n\n${message}` : title);
}
