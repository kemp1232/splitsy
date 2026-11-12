import { Alert } from 'react-native';

import { showAlert } from './alert';

describe('showAlert (native)', () => {
  it('delegates to Alert.alert with the title and message', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    showAlert('Heading', 'Body');

    expect(alertSpy).toHaveBeenCalledWith('Heading', 'Body');
    alertSpy.mockRestore();
  });
});
