import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../client';
import { previewWorkspaceFeedback, type WorkspaceFeedbackRequest } from '../workspaceFeedback';

const request: WorkspaceFeedbackRequest={roomId:1,revision:'current',feedback:'이동',roomDimensions:{width:6,depth:6,height:2.7},
  furniture:[],lockedFurnitureIds:[],selectedFurnitureId:null,preferences:{purpose:'휴식',style:'natural',palette:'auto'}};
afterEach(()=>vi.restoreAllMocks());
describe('workspace feedback API',()=>{
  it('posts a transient snapshot and forwards cancellation without creating a layout',async()=>{
    const post=vi.spyOn(apiClient,'post').mockResolvedValue({data:{success:true,data:{revision:'current',source:'LLM',status:'NEEDS_CLARIFICATION',summary:'질문',furniture:[],operationResults:[]}}});
    const abort=new AbortController();await previewWorkspaceFeedback(request,abort.signal);
    expect(post).toHaveBeenCalledExactlyOnceWith('/api/layouts/feedback/preview',request,{signal:abort.signal});
  });
  it.each([{revision:'older'},{source:'RULE_BASED'},{status:'PARTIAL_SUCCESS'},{operationResults:null}])('rejects incompatible response %o',async change=>{
    vi.spyOn(apiClient,'post').mockResolvedValue({data:{success:true,data:{revision:'current',source:'LLM',status:'SUCCESS',summary:'후보',furniture:[],operationResults:[],...change}}});
    await expect(previewWorkspaceFeedback(request,new AbortController().signal)).rejects.toThrow('피드백 응답');
  });
});
