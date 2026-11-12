import { clearCapturedPhoto, getCapturedPhoto, putCapturedPhoto } from './capturedPhotoStore';

const DATA_URI = 'data:image/jpeg;base64,AAAA';

afterEach(() => {
  clearCapturedPhoto();
});

describe('capturedPhotoStore', () => {
  it('returns the stored photo for its id, which is short and not the image', () => {
    const id = putCapturedPhoto(DATA_URI);

    expect(getCapturedPhoto(id)).toBe(DATA_URI);
    expect(id).not.toContain('base64');
    expect(id.length).toBeLessThan(20);
  });

  it('can be read more than once', () => {
    const id = putCapturedPhoto(DATA_URI);

    getCapturedPhoto(id);
    expect(getCapturedPhoto(id)).toBe(DATA_URI);
  });

  it('returns undefined for a missing or unknown id (e.g. after a reload)', () => {
    expect(getCapturedPhoto(undefined)).toBeUndefined();
    expect(getCapturedPhoto('photo-unknown')).toBeUndefined();
  });

  it('replaces the previous capture with a new one', () => {
    const firstId = putCapturedPhoto('data:image/jpeg;base64,FIRST');
    const secondId = putCapturedPhoto('data:image/jpeg;base64,SECOND');

    expect(getCapturedPhoto(firstId)).toBeUndefined();
    expect(getCapturedPhoto(secondId)).toBe('data:image/jpeg;base64,SECOND');
  });

  it('forgets the photo once cleared', () => {
    const id = putCapturedPhoto(DATA_URI);
    clearCapturedPhoto();

    expect(getCapturedPhoto(id)).toBeUndefined();
  });
});
