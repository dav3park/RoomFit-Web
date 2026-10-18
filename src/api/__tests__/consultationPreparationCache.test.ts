import {describe,it,expect,vi,afterEach} from 'vitest';
import {resolveConsultationPreparation,type ConsultationSelection} from '../designConsultation';
import {apiClient} from '../client';
const selection=(description:string):ConsultationSelection=>({description,kind:'OTHER',value:'',source:'USER_TEXT',evidence:description,imageIndex:null,priority:'REQUIRED',support:'NEEDS_ENGINE_SUPPORT',included:true});
const inputs=[selection('책장 1개'),selection('옷장 제외')];
const cached={revision:'r',conditions:[{id:'0',effects:[{kind:'REQUIRE_TYPE',value:'bookshelf',count:1}],unresolved:[]},{id:'1',effects:[{kind:'EXCLUDE_TYPE',value:'wardrobe',count:0}],unresolved:[]}]};
afterEach(()=>vi.restoreAllMocks());
describe('single-pass consultation reuse',()=>{
 it('does not call LLM again for confirmed unchanged conditions or priority/exclusion toggles',async()=>{
  const post=vi.spyOn(apiClient,'post');
  const result=await resolveConsultationPreparation([{...inputs[0],priority:'PREFERRED'}, {...inputs[1],included:false}],cached,[],new AbortController().signal);
  expect(post).not.toHaveBeenCalled();expect(result.conditions.map(item=>item.id)).toEqual(['0']);
 });
 it('reinterprets only edited included conditions, retaining original effect identity',async()=>{
  const post=vi.spyOn(apiClient,'post').mockImplementation(async(_url,data)=>{
   const request=data as {revision:string;conditions:{id:string;description:string}[]};expect(request.conditions).toEqual([{id:'0',description:'책장 2개',priority:'REQUIRED'}]);
   return {data:{success:true,data:{revision:request.revision,conditions:[{id:'0',effects:[{kind:'REQUIRE_TYPE',value:'bookshelf',count:2}],unresolved:[]}]}}};
  });
  const result=await resolveConsultationPreparation([{...inputs[0],source:'USER_EDIT',description:'책장 2개'},inputs[1]],cached,[],new AbortController().signal);
  expect(post).toHaveBeenCalledTimes(1);expect(result.conditions.find(item=>item.id==='1')).toEqual(cached.conditions[1]);
 });
});
