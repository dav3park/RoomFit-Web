import { afterEach, describe, expect, it, vi } from 'vitest';
import { DESIGN_IMAGE_MAX_BYTES, designImageBatchError, prepareDesignImages, validateDesignImageContent } from '../designConsultationImages';

const png = () => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'room.png', { type: 'image/png' });
afterEach(() => vi.unstubAllGlobals());

describe('design consultation reference images', () => {
  it('rejects the whole batch when it would exceed three images, without silently dropping files', () => {
    expect(designImageBatchError([png(), png()], 2)).toContain('최대 3장');
    expect(designImageBatchError([png()], 2)).toBeNull();
  });
  it('rejects empty, oversized and unsupported files including SVG and HEIC', () => {
    expect(designImageBatchError([new File([], 'empty.png', { type: 'image/png' })], 0)).toContain('내용이 없는');
    expect(designImageBatchError([new File([new Uint8Array(DESIGN_IMAGE_MAX_BYTES + 1)], 'big.jpg', { type: 'image/jpeg' })], 0)).toContain('5 MB');
    for (const type of ['image/svg+xml', 'image/heic', 'image/gif', 'application/pdf', '']) {
      expect(designImageBatchError([new File(['x'], 'file', { type })], 0)).toContain('JPG, PNG, WebP');
    }
  });
  it('checks the actual signature rather than trusting the filename or MIME type', async () => {
    await expect(validateDesignImageContent(png())).resolves.toBeUndefined();
    await expect(validateDesignImageContent(new File(['not a photo'], 'fake.png', { type: 'image/png' }))).rejects.toThrow('사진 형식');
    await expect(validateDesignImageContent(new File([await png().arrayBuffer()], 'fake.jpg', { type: 'image/jpeg' }))).rejects.toThrow('사진 형식');
    await expect(validateDesignImageContent(new File([new Uint8Array([255, 216, 255])], 'photo.jpg', { type: 'image/jpeg' }))).resolves.toBeUndefined();
    await expect(validateDesignImageContent(new File(['RIFF1234WEBP'], 'photo.webp', { type: 'image/webp' }))).resolves.toBeUndefined();
  });
  it('releases all object URLs if decoding any image in a batch fails', async () => {
    const revoke = vi.fn(); let decoded = 0;
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => `blob:${decoded}`), revokeObjectURL: revoke });
    vi.stubGlobal('Image', class {
      naturalWidth = 100; naturalHeight = 100;
      decode() { return ++decoded === 2 ? Promise.reject(new Error('corrupt')) : Promise.resolve(); }
    });
    await expect(prepareDesignImages([png(), png()])).rejects.toThrow('사진을 열 수 없습니다');
    expect(revoke).toHaveBeenCalledTimes(2);
  });
  it('rejects excessive decoded dimensions and releases the preview', async () => {
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:large'), revokeObjectURL: revoke });
    vi.stubGlobal('Image', class {
      naturalWidth = 6000; naturalHeight = 6000;
      decode() { return Promise.resolve(); }
    });
    await expect(prepareDesignImages([png()])).rejects.toThrow('2,500만 화소');
    expect(revoke).toHaveBeenCalledWith('blob:large');
  });
});
