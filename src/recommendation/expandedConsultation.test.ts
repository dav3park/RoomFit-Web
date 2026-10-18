import {describe,it,expect} from 'vitest';
import recorded from './recordedConsultation.fixture.json';
import {compileConsultation} from './consultation';
import {generateRecommendations} from './engine';
import {auditConsultationProposal} from './consultationAudit';
import {validateRecommendationLayout} from './layoutValidation';
import {DEMO_ROOMS} from '../pages/workspaceDemoState';
import type {ConsultationSelection} from '../api/designConsultation';
describe('recorded AI conditions against the expanded catalog',()=>{
 it.each(recorded.map((value,index)=>({value,index})))('preserves counts/exclusion for response $index',({value,index})=>{
  const room=structuredClone(DEMO_ROOMS[0]);
  const selections=value.requirements.map(item=>({...item,included:true})) as ConsultationSelection[];
  const compiled=compileConsultation(selections,value.preparation,room);
  expect(compiled.blockers).toEqual([]);expect(compiled.options).not.toBeNull();
  expect(compiled.options!.constraints?.counts).toMatchObject({desk:1,bookshelf:1,plant:3});
  expect(compiled.options!.constraints?.excludedTypes).toContain('wardrobe');
  const result=generateRecommendations(room,{...compiled.options!,seed:41+index});
  expect(result.proposals.length).toBeGreaterThan(0);
  for(const candidate of result.proposals){expect(auditConsultationProposal(candidate.room,compiled.options!,room).valid).toBe(true);expect(validateRecommendationLayout(candidate.room).valid).toBe(true);}
 },30000);
});
