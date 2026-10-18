import { describe,it,expect } from 'vitest';
import { compileConsultation, type PreparedConsultation } from './consultation';
import type { ConsultationSelection } from '../api/designConsultation';
import { DEMO_ROOMS } from '../pages/workspaceDemoState';
const selection=(description:string,priority:'REQUIRED'|'PREFERRED'='REQUIRED'):ConsultationSelection=>({description,priority,included:true,kind:'OTHER',value:'',source:'USER_EDIT',evidence:'',imageIndex:null,support:'NEEDS_REVIEW'});
const selections=[selection('책상과 책장 필요'),selection('옷장 제외')];
const prepared:PreparedConsultation={revision:'r',conditions:[{id:'0',effects:[{kind:'REQUIRE_TYPE',value:'desk',count:1},{kind:'REQUIRE_TYPE',value:'bookshelf',count:1}],unresolved:[]},{id:'1',effects:[{kind:'EXCLUDE_TYPE',value:'wardrobe',count:0}],unresolved:[]}]};
describe('confirmed consultation compiler',()=>{
 it('compiles all confirmed edited conditions into counts and exclusions',()=>{
  const result=compileConsultation(selections,prepared,DEMO_ROOMS[0]);
  expect(result.blockers).toEqual([]);expect(result.options?.constraints?.counts).toEqual({desk:1,bookshelf:1});
  expect(result.options?.constraints?.excludedTypes).toEqual(['wardrobe']);expect(result.options?.keepTypes).toBe(false);
 });
 it('blocks unresolved mandatory wishes and reports optional omissions without claiming success',()=>{
  const input=[selection('요가 2m x 1m')]; const plan={revision:'r',conditions:[{id:'0',effects:[],unresolved:['요가 공간 크기는 아직 검증할 수 없어요.']}]};
  expect(compileConsultation(input,plan,DEMO_ROOMS[0]).blockers.join()).toContain('요가');
  const result=compileConsultation([{...input[0],priority:'PREFERRED'}],plan,DEMO_ROOMS[0]);
  expect(result.omitted.join()).toContain('요가');expect(result.options).toBeNull();
 });
 it('rejects incomplete coverage, invented effects and invalid quantities',()=>{
  expect(()=>compileConsultation(selections,{...prepared,conditions:prepared.conditions.slice(0,1)},DEMO_ROOMS[0])).toThrow();
  for(const effect of [{kind:'REQUIRE_TYPE',value:'desk',count:0},{kind:'KEEP_ITEM',value:'fake',count:0},{kind:'PALETTE',value:'neon',count:0}]){
   expect(()=>compileConsultation([selections[0]],{revision:'r',conditions:[{id:'0',effects:[effect],unresolved:[]}]},DEMO_ROOMS[0])).toThrow();
  }
 });
 it('blocks conflicting counts, excluded locks and competing tags',()=>{
  const cases=[{kind:'EXCLUDE_TYPE',value:'desk',count:0},{kind:'REQUIRE_TYPE',value:'desk',count:2}];
  for(const effect of cases){const result=compileConsultation(selections,{...prepared,conditions:[prepared.conditions[0],{id:'1',effects:[effect],unresolved:[]}]},DEMO_ROOMS[0]);expect(result.blockers.length).toBeGreaterThan(0);}
  const result=compileConsultation(selections,{revision:'r',conditions:[{id:'0',effects:[{kind:'STYLE',value:'natural',count:0}],unresolved:[]},{id:'1',effects:[{kind:'STYLE',value:'modern',count:0}],unresolved:[]}]},DEMO_ROOMS[0]);
  expect(result.options).toBeNull();expect(result.blockers.join()).toContain('스타일');
 });
});
