import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../client';
import { analyzeDesignConsultation, consultationErrorMessage, validateConsultationAnalysis, prepareDesignConsultation } from '../designConsultation';

const work = { kind: 'PURPOSE', value: '업무 / 공부', description: '업무 공간', source: 'USER_TEXT', evidence: '재택근무', imageIndex: null, priority: 'PREFERRED', support: 'SUPPORTED' };
const response = { revision: 'current', source: 'LLM', summary: '업무에 맞는 공간', requirements: [work], questions: [] };
afterEach(() => vi.restoreAllMocks());
describe('design consultation analysis boundary', () => {
  it('posts multipart JSON metadata without changing a layout and forwards abort', async () => {
    const post = vi.spyOn(apiClient, 'post').mockImplementation(async (_url, data) => {
      const request = JSON.parse(await ((data as FormData).get('brief') as Blob).text());
      expect(request).toMatchObject({ description: '재택근무', furniture: [] });
      return { data: { success: true, data: { ...response, revision: request.revision } } };
    });
    const abort = new AbortController();
    await expect(analyzeDesignConsultation('재택근무', [], [], abort.signal)).resolves.toMatchObject({ source: 'LLM' });
    expect(post).toHaveBeenCalledExactlyOnceWith('/api/design-consultation/analyze', expect.any(FormData), { signal: abort.signal, timeout: 70_000 });
  });
  it.each([{ revision: 'stale' }, { source: 'MOCK' }, { requirements: null }, { questions: [42] }, { requirements: [{ ...work, evidence: '없는 문장' }] },
    { requirements: [{ ...work, source: 'REFERENCE_IMAGE', imageIndex: 1 }] },
    { requirements: [{ ...work, kind: 'KEEP_FURNITURE', value: 'invented' }] }])('rejects incompatible or ungrounded response %o', patch => {
    expect(() => validateConsultationAnalysis({ ...response, ...patch }, 'current', '재택근무', [], [])).toThrow('분석 결과');
  });
  it('supports question-only analysis without fake preferences', () => {
    expect(validateConsultationAnalysis({ ...response, requirements: [], questions: ['어떤 분위기를 좋아하세요?'] }, 'current', '안녕', [], []).requirements).toEqual([]);
  });
  it('does not start a network call when cancelled', async () => {
    const post = vi.spyOn(apiClient, 'post'); const abort = new AbortController(); abort.abort();
    await expect(analyzeDesignConsultation('재택근무', [], [], abort.signal)).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
  it('uses bounded error messages without reflecting provider content', () => {
    const error = { isAxiosError: true, response: { data: { error: { code: 'CONSULTATION_FAILED', message: 'secret-key', requestId: 'req-123' } } } };
    expect(consultationErrorMessage(error)).toContain('req-123'); expect(consultationErrorMessage(error)).not.toContain('secret');
  });
});

describe('confirmed consultation preparation transport',()=>{
 it('sends only included current descriptions and rejects stale revisions',async()=>{
  const post=vi.spyOn(apiClient,'post').mockImplementation(async(_url,body)=>{
   const request=body as {revision:string;conditions:unknown[]};
   expect(request.conditions).toEqual([{id:'0',description:'책상 두 개',priority:'REQUIRED'}]);
   return {data:{success:true,data:{revision:request.revision,conditions:[{id:'0',effects:[{kind:'REQUIRE_TYPE',value:'desk',count:2}],unresolved:[]}]}}};
  });
  const input=[{...work,description:'책상 두 개',priority:'REQUIRED',included:true},{...work,included:false}];
  await expect(prepareDesignConsultation(input as never,[],new AbortController().signal)).resolves.toHaveProperty('conditions');
  expect(post.mock.calls[0][0]).toBe('/api/design-consultation/prepare');
  post.mockResolvedValueOnce({data:{success:true,data:{revision:'stale',conditions:[]}}});
  await expect(prepareDesignConsultation(input as never,[],new AbortController().signal)).rejects.toThrow();
 });
});
