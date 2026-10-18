import {describe,it,expect} from 'vitest';
import {generateRecommendations,type RecommendationOptions} from './engine';
import {validateRecommendationLayout} from './layoutValidation';
import {computeLocalValidationIssues} from '../geometry/liveValidation';
import {resolveFurnitureInstallations} from '../geometry/furnitureInstallation';
import {DEMO_ROOMS} from '../pages/workspaceDemoState';
const studio=()=>{const room=structuredClone(DEMO_ROOMS[0]);room.name='원룸 Sample Room';room.width=5.8;room.depth=5.4;room.height=2.7;
 room.walls=[{id:'north',start:{x:-2.9,z:-2.7},end:{x:2.9,z:-2.7}},{id:'east',start:{x:2.9,z:-2.7},end:{x:2.9,z:2.7}},{id:'south',start:{x:2.9,z:2.7},end:{x:-2.9,z:2.7}},{id:'west',start:{x:-2.9,z:2.7},end:{x:-2.9,z:-2.7}}];
 room.windows=[{id:'window',position:{x:-1.8,z:-2.7},rotationY:0,dimensions:{width:2.2,height:1.5,depth:.1},label:'창문',wallId:'north',sillHeight:.7}];
 room.doors=[{id:'door',position:{x:1.7,z:2.7},rotationY:0,dimensions:{width:.9,height:2.1,depth:.1},label:'문',wallId:'south'}];return room;};
const options:RecommendationOptions={purpose:'휴식',style:'natural',palette:'beige',mode:'new',keepTypes:false,keepSizes:false,seed:41};
const photo={...options,constraints:{counts:{bed:1,sofa:1,rug:1,curtain_blind:1,multi_table:1,mood_lamp:1},excludedTypes:[],keepIds:[],strictStyle:false}};
function valid(proposals:ReturnType<typeof generateRecommendations>['proposals']){
 expect(proposals.length).toBeGreaterThan(0);
 for(const p of proposals){expect(validateRecommendationLayout(p.room).valid).toBe(true);expect(computeLocalValidationIssues(p.room.furniture,p.room,'render').filter(i=>i.severity==='ERROR')).toEqual([]);}
}
describe('furnished studio recommendations',()=>{
 it('explains window capacity instead of advising a nonexistent new-design switch',()=>{
  const result=generateRecommendations(studio(),{...options,constraints:{counts:{curtain_blind:2},excludedTypes:[],keepIds:[],strictStyle:false}});
  expect(result.proposals).toHaveLength(0);
  expect(result.messages.join(' ')).toContain('창문 1개');
  expect(result.messages.join(' ')).toContain('요청한 커튼·블라인드 2개');
  expect(result.messages.join(' ')).not.toContain('새로운 디자인');
 });
 it('preserves all photo-requested furniture including a corner-window treatment',()=>{
  const result=generateRecommendations(studio(),photo);expect(result.proposals.length,JSON.stringify(result.messages)).toBeGreaterThan(0);valid(result.proposals);
  for(const p of result.proposals)for(const [type,count] of Object.entries(photo.constraints.counts))expect(p.room.furniture.filter(f=>f.sourceType===type),type).toHaveLength(count);
 },60000);
 it('adds living layers, a window treatment and a divider to a non-minimal studio',()=>{
  const room=studio(),result=generateRecommendations(room,options);valid(result.proposals);
  for(const p of result.proposals)expect(p.room.furniture.length).toBeGreaterThanOrEqual(8);
  expect(result.proposals.some(p=>p.room.furniture.some(f=>f.sourceType==='curtain_blind'))).toBe(true);
  expect(result.proposals.some(p=>p.room.furniture.some(f=>f.variantId==='curtain-fabric'))).toBe(true);
  expect(result.proposals.some(p=>p.room.furniture.some(f=>f.sourceType==='partition_shelf'))).toBe(true);
  for(const p of result.proposals){const installed=resolveFurnitureInstallations(p.room,p.room.furniture);expect([...installed.values()].every(i=>i.valid)).toBe(true);}
 },60000);
 it('keeps minimal compositions sparse and does not add types when keeping the inventory',()=>{
  const room=studio(),minimal=generateRecommendations(room,{...options,style:'minimal'});valid(minimal.proposals);
  for(const p of minimal.proposals)expect(p.room.furniture.length).toBeLessThanOrEqual(5);
  const kept=generateRecommendations(room,{...options,keepTypes:true});valid(kept.proposals);
  for(const p of kept.proposals)expect(p.room.furniture.map(f=>f.id).sort()).toEqual(room.furniture.map(f=>f.id).sort());
 },60000);
 it('never adds excluded furnishings or window treatments without windows',()=>{
  const room=studio();room.windows=[];
  const result=generateRecommendations(room,{...options,constraints:{counts:{bed:1},excludedTypes:['sofa','wardrobe','partition_shelf','curtain_blind'],keepIds:[],strictStyle:false}});valid(result.proposals);
  for(const p of result.proposals)expect(p.room.furniture.some(f=>['sofa','wardrobe','partition_shelf','curtain_blind'].includes(f.sourceType??''))).toBe(false);
 },60000);
});
