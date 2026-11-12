import { Alert } from 'react-native';

// User-facing one-off message (an error or a short confirmation). Native
// uses the OS alert; react-native-web's Alert.alert is a no-op, so web has
// its own implementation in alert.web.ts. Message-only on purpose: no caller
// needs buttons/callbacks (confirmations use ConfirmationDialog instead).
export function showAlert(title: string, message?: string): void {
  Alert.alert(title, message);
}
