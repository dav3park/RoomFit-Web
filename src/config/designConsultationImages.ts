export const DESIGN_IMAGE_LIMIT = 3;
export const DESIGN_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const DESIGN_DESCRIPTION_LIMIT = 2000;
export const DESIGN_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

export interface DesignReferenceImage {
  id: string;
  file: File;
  url: string;
}

export function designImageBatchError(files: readonly File[], existingCount: number): string | null {
  if (files.length + existingCount > DESIGN_IMAGE_LIMIT) return '사진은 최대 3장까지 첨부할 수 있어요. 기존 사진을 삭제한 뒤 다시 추가해 주세요.';
  for (const file of files) {
    if (!DESIGN_IMAGE_ACCEPT.split(',').includes(file.type)) return 'JPG, PNG, WebP 사진만 첨부할 수 있어요. 지원하는 형식으로 저장한 뒤 다시 추가해 주세요.';
    if (!file.size) return '내용이 없는 파일이에요. 다른 사진을 선택해 주세요.';
    if (file.size > DESIGN_IMAGE_MAX_BYTES) return '사진 한 장은 5 MB 이하여야 해요. 용량을 줄인 뒤 다시 추가해 주세요.';
  }
  return null;
}

export async function validateDesignImageContent(file: File): Promise<void> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!(file.type === 'image/png' && png || file.type === 'image/jpeg' && jpeg || file.type === 'image/webp' && webp)) {
    throw new Error('사진 형식을 확인할 수 없어요. 정상적인 JPG, PNG, WebP 파일을 선택해 주세요.');
  }
}

export function releaseDesignImages(images: readonly DesignReferenceImage[]) {
  images.forEach(image => URL.revokeObjectURL(image.url));
}

export async function prepareDesignImages(files: readonly File[]): Promise<DesignReferenceImage[]> {
  const images: DesignReferenceImage[] = [];
  try {
    for (const file of files) {
      await validateDesignImageContent(file);
      const image = { id: crypto.randomUUID(), file, url: URL.createObjectURL(file) };
      images.push(image);
      const preview = new Image();
      preview.src = image.url;
      await preview.decode().catch(() => { throw new Error('사진을 열 수 없어요. 다른 사진을 선택하거나 다시 저장한 뒤 추가해 주세요.'); });
      if (!preview.naturalWidth || !preview.naturalHeight || preview.naturalWidth * preview.naturalHeight > 25_000_000) {
        throw new Error('사진 해상도가 너무 커요. 2,500만 화소 이하로 줄인 뒤 다시 추가해 주세요.');
      }
    }
    return images;
  } catch (error) {
    releaseDesignImages(images);
    throw error;
  }
}
