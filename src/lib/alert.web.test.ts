import { showAlert } from './alert.web';

describe('showAlert (web)', () => {
  const originalAlert = window.alert;
  let alertMock: jest.Mock;

  beforeEach(() => {
    alertMock = jest.fn();
    window.alert = alertMock;
  });

  afterEach(() => {
    window.alert = originalAlert;
  });

  it('calls window.alert with the title and message joined', () => {
    showAlert('Heading', 'Body');

    expect(alertMock).toHaveBeenCalledWith('Heading\n\nBody');
  });

  it('calls window.alert with just the title when there is no message', () => {
    showAlert('Copied');

    expect(alertMock).toHaveBeenCalledWith('Copied');
  });
});
