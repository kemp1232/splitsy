import { act, renderHook } from '@testing-library/react-native';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { copy } from '@/constants/copy';
import { shareImage } from '@/lib/share';

import { useShareSummaryImage } from './useShareSummaryImage';

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('@/lib/share', () => ({ shareImage: jest.fn() }));

const mockCaptureRef = captureRef as jest.MockedFunction<typeof captureRef>;
const mockShareImage = shareImage as jest.MockedFunction<typeof shareImage>;

async function renderMountedHook() {
  const hook = await renderHook(() => useShareSummaryImage());
  hook.result.current.cardRef.current = {} as View;
  return hook;
}

describe('useShareSummaryImage', () => {
  beforeEach(() => {
    mockCaptureRef.mockReset();
    mockShareImage.mockReset();
  });

  it('captures the card as a PNG and shares it, with no toast or error', async () => {
    mockCaptureRef.mockResolvedValue('file:///tmp/summary.png');
    mockShareImage.mockResolvedValue('shared');
    const onDownloaded = jest.fn();
    const { result } = await renderMountedHook();

    await act(async () => {
      await result.current.share(onDownloaded);
    });

    expect(mockCaptureRef).toHaveBeenCalledWith(result.current.cardRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });
    expect(mockShareImage).toHaveBeenCalledWith('file:///tmp/summary.png', 'bill-summary');
    expect(onDownloaded).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('calls onDownloaded when the image was downloaded instead of shared', async () => {
    mockCaptureRef.mockResolvedValue('data:image/png;base64,AAAA');
    mockShareImage.mockResolvedValue('downloaded');
    const onDownloaded = jest.fn();
    const { result } = await renderMountedHook();

    await act(async () => {
      await result.current.share(onDownloaded);
    });

    expect(onDownloaded).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('shows the failure message when capturing fails', async () => {
    mockCaptureRef.mockRejectedValue(new Error('capture failed'));
    const { result } = await renderMountedHook();

    await act(async () => {
      await result.current.share(jest.fn());
    });

    expect(mockShareImage).not.toHaveBeenCalled();
    expect(result.current.error).toBe(copy.summary.shareImageFailure);
  });

  it('shows the failure message when sharing fails', async () => {
    mockCaptureRef.mockResolvedValue('file:///tmp/summary.png');
    mockShareImage.mockRejectedValue(new Error('sharing unavailable'));
    const onDownloaded = jest.fn();
    const { result } = await renderMountedHook();

    await act(async () => {
      await result.current.share(onDownloaded);
    });

    expect(onDownloaded).not.toHaveBeenCalled();
    expect(result.current.error).toBe(copy.summary.shareImageFailure);
  });

  it('ignores a second share while the first is still running', async () => {
    let finishCapture: (uri: string) => void = () => undefined;
    mockCaptureRef.mockReturnValue(
      new Promise<string>((resolve) => {
        finishCapture = resolve;
      }),
    );
    mockShareImage.mockResolvedValue('shared');
    const { result } = await renderMountedHook();

    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.share(jest.fn());
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      await result.current.share(jest.fn());
    });
    await act(async () => {
      finishCapture('file:///tmp/summary.png');
      await first;
    });

    expect(mockCaptureRef).toHaveBeenCalledTimes(1);
    expect(mockShareImage).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('shows the failure message when the card is not mounted', async () => {
    const { result } = await renderHook(() => useShareSummaryImage());

    await act(async () => {
      await result.current.share(jest.fn());
    });

    expect(mockCaptureRef).not.toHaveBeenCalled();
    expect(result.current.error).toBe(copy.summary.shareImageFailure);
  });
});
