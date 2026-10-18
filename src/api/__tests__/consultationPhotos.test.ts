import {afterEach, expect, it, vi} from 'vitest';
import {apiClient} from '../client';
import {analyzeDesignConsultation, consultationPhoto} from '../designConsultation';

afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});
const reference = () => ({id:crypto.randomUUID(), file:new File(['sample'], 'room.png', {type:'image/png'}), url:'blob:sample'});

function imageEnvironment() {
  let active = 0, maximum = 0;
  const decode = vi.fn(async () => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 10));
    active--;
  });
  vi.stubGlobal('Image', class {naturalWidth = 1024; naturalHeight = 768; decode = decode;});
  const canvas = {width:0, height:0, getContext:() => ({fillRect:vi.fn(), drawImage:vi.fn()}),
    toBlob:(done:(blob:Blob) => void) => done(new Blob(['bounded-jpeg'], {type:'image/jpeg'}))};
  vi.stubGlobal('document', {createElement:() => canvas});
  return {decode, maximum:() => maximum};
}

it('prepares up to three photos concurrently while retaining attachment order', async () => {
  const environment = imageEnvironment(), images = [reference(), reference(), reference()];
  const post = vi.spyOn(apiClient, 'post').mockImplementation(async (_path, body) => {
    const form = body as FormData;
    const brief = JSON.parse(await (form.get('brief') as Blob).text());
    expect(form.getAll('images').map(file => (file as File).name)).toEqual(['reference-1.jpg','reference-2.jpg','reference-3.jpg']);
    return {data:{success:true, data:{revision:brief.revision, source:'LLM', summary:'취향을 확인합니다.', requirements:[], questions:['좋아하는 분위기가 있습니까?']}}};
  });
  await analyzeDesignConsultation('', images, [], new AbortController().signal);
  expect(environment.maximum()).toBe(3);
  expect(post).toHaveBeenCalledTimes(1);
});

it('reuses the bounded JPEG for the same attached file without decoding it on each retry', async () => {
  const environment = imageEnvironment(), image = reference(), signal = new AbortController().signal;
  const first = await consultationPhoto(image, signal);
  expect(await consultationPhoto(image, signal)).toBe(first);
  expect(environment.decode).toHaveBeenCalledTimes(1);
  const abort = new AbortController(); abort.abort();
  await expect(consultationPhoto(image, abort.signal)).rejects.toThrow();
});

it('does not cache a failed photo conversion or post after cancellation', async () => {
  const environment = imageEnvironment(), image = reference();
  environment.decode.mockRejectedValueOnce(new Error('decode failed'));
  await expect(consultationPhoto(image, new AbortController().signal)).rejects.toThrow('decode failed');
  await expect(consultationPhoto(image, new AbortController().signal)).resolves.toBeInstanceOf(Blob);
  const post = vi.spyOn(apiClient, 'post');
  const abort = new AbortController(); abort.abort();
  await expect(analyzeDesignConsultation('', [image], [], abort.signal)).rejects.toThrow();
  expect(post).not.toHaveBeenCalled();
});
