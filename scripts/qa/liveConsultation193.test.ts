import {afterAll,describe,it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import responses from '../../docs/qa/live-consultation-193-responses.json';
import {validateConsultationAnalysis} from '../../src/api/designConsultation';
import type {ConsultationSelection} from '../../src/api/designConsultation';
import type {DesignReferenceImage} from '../../src/config/designConsultationImages';
import {compileConsultation} from '../../src/recommendation/consultation';
import {generateRecommendations,type RecommendationOptions} from '../../src/recommendation/engine';
import {auditConsultationProposal} from '../../src/recommendation/consultationAudit';
import {validateRecommendationLayout} from '../../src/recommendation/layoutValidation';
import {resolveFurnitureInstallations} from '../../src/geometry/furnitureInstallation';
import {computeLocalValidationIssues} from '../../src/geometry/liveValidation';
import {DEMO_ROOMS} from '../../src/pages/workspaceDemoState';
const results:unknown[]=[];
const briefFurniture=[{id:'bed',name:'침대',type:'bed'},{id:'desk',name:'책상',type:'desk'},{id:'wardrobe',name:'옷장',type:'wardrobe'}];
const source=()=>{const room=structuredClone(DEMO_ROOMS[0]);room.height=2.7;room.windows[0].position.x=0;return room;};
function inspect(options:RecommendationOptions,label:string){
 const room=source(),start=performance.now();
 const result=generateRecommendations(room,{...options,seed:41});
 expect(result.proposals.length,label+JSON.stringify(result.messages)).toBeGreaterThan(0);
 const candidates=result.proposals.map(candidate=>{
  const audit=auditConsultationProposal(candidate.room,options,room),geometry=validateRecommendationLayout(candidate.room);
  const installations=resolveFurnitureInstallations(candidate.room,candidate.room.furniture);
  const liveErrors=computeLocalValidationIssues(candidate.room.furniture,candidate.room,'render').filter(issue=>issue.severity==='ERROR');
  expect(audit.valid,label+JSON.stringify(audit.issues)).toBe(true);
  expect(geometry.valid,label+JSON.stringify(geometry.reasons)).toBe(true);
  expect([...installations.values()].every(item=>item.valid),label).toBe(true);
  expect(liveErrors,label).toEqual([]);
  return {id:candidate.id,checks:audit.checks,inventory:audit.inventory,warnings:geometry.warnings,
   installations:[...installations.entries()].map(([id,item])=>({id,valid:item.valid,supportId:item.supportId,openingId:item.openingId,minY:item.minY,maxY:item.maxY}))};
 });
 return {proposals:candidates,engineMs:Math.round(performance.now()-start)};
}
describe('approved live AI responses -> 193-model engine -> independent audit',()=>{
 it.each(responses)('$group / $attempt',row=>{
  expect(row.status).toBe(200);
  const images=(row.group==='text'?[]:[{id:'sample-reference'}]) as DesignReferenceImage[];
  const analysis=validateConsultationAnalysis(row.body.data,row.revision,row.description,images,briefFurniture);
  const selections=analysis.requirements.map(item=>({...item,included:true})) as ConsultationSelection[];
  const compiled=compileConsultation(selections,analysis.preparation!,source());
  expect(compiled.blockers).toEqual([]);expect(compiled.omitted).toEqual([]);expect(compiled.options).not.toBeNull();
  if(row.group==='text')expect(compiled.options!.constraints?.counts).toMatchObject({plant:3,desk:1,bookshelf:1});
  if(row.group==='mixed')expect(compiled.options!.constraints?.counts).toMatchObject({plant:2,bookshelf:1});
  if(row.group!=='image')expect(compiled.options!.constraints?.excludedTypes).toContain('wardrobe');
  if(row.group==='image')expect(compiled.options!.constraints?.counts).toMatchObject({curtain_blind:1});
  const inspected=inspect(compiled.options!,row.group+'/'+row.attempt);
  results.push({group:row.group,attempt:row.attempt,requestId:row.revision,analysisMs:row.elapsedMs,...inspected});
 },60000);
 it('also preserves explicit room-divider and curtain requirements together',()=>{
  const options:RecommendationOptions={purpose:'업무 / 공부',style:'modern',palette:'gray',mode:'new',keepTypes:false,keepSizes:false,
   constraints:{counts:{bed:1,desk:1,desk_chair:1,curtain_blind:1,partition_shelf:1,mood_lamp:1},excludedTypes:['wardrobe'],keepIds:[],strictStyle:false}};
  results.push({group:'explicit-divider',...inspect(options,'explicit-divider')});
 },60000);
});
afterAll(()=>{if(process.env.ROOMFIT_WRITE_QA_RESULTS==='1')writeFileSync('docs/qa/live-consultation-193-results.json',JSON.stringify(results,null,2)+'\n');});
