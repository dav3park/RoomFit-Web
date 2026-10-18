import {describe,it,expect} from 'vitest';
import fixture from './uploadedRoom.fixture.json';
import {computeLocalValidationIssues} from '../geometry/liveValidation';
import type {RoomLayout} from '../types';
import {generateRecommendations,type RecommendationOptions} from './engine';
import {doorFrame,validateCirculation,validateRecommendationLayout} from './layoutValidation';
const room=fixture as unknown as RoomLayout;
const tiny:RoomLayout={...room,name:'작은 원룸',width:2.4,depth:2.8,walls:[],windows:[],furniture:[],doors:[{id:'entry',label:'문',position:{x:0,z:1.4},rotationY:0,dimensions:{width:.9,depth:.1,height:2.1}}]};
const options:RecommendationOptions={purpose:'휴식',style:'midcentury',palette:'auto',mode:'new',keepTypes:false,keepSizes:false,seed:41};
describe('uploaded concave studio',()=>{
 it('can reach both scanned doorways in an empty room',()=>{
  const result=validateCirculation({...room,furniture:[]});
  expect(result.valid,JSON.stringify(result)).toBe(true);
 });
 it('keeps a real 60 cm doorway when the scan is offset from grid columns',()=>{
  for(const width of [.59,.6,.72]) {const layout={...room,furniture:[],doors:[{...room.doors[0],dimensions:{...room.doors[0].dimensions,width}}]};
   expect(validateCirculation(layout).valid,`door width ${width}`).toBe(width>=.6);
  }
 });
 it('still rejects a blocked doorway instead of connecting through an obstacle',()=>{
  const door=room.doors[0],{inward}=doorFrame(room,door);
  const blocker={...room.furniture[0],id:'door-blocker',category:'desk' as const,sourceType:'multi_table',variantId:null,productId:null,dimensions:{width:1,depth:1,height:.8},position:{x:door.position.x+inward.x*.4,z:door.position.z+inward.z*.4}};
  const result=validateCirculation({...room,furniture:[blocker]});
  expect(result.valid).toBe(false);expect(result.reasons.join(' ')).toContain('출입문');
 });
 it.each(['minimal','natural','modern','classic','midcentury'] as const)('supports %s with all inventory preservation options off',style=>{
  for(const seed of [41,92]){const result=generateRecommendations(room,{...options,style,seed});
   expect(result.proposals.length,`${style}/${seed}: ${result.messages.join(' ')}`).toBeGreaterThan(0);
   for(const p of result.proposals){expect(validateRecommendationLayout(p.room).valid).toBe(true);expect(computeLocalValidationIssues(p.room.furniture,p.room,'render').filter(i=>i.severity==='ERROR')).toEqual([]);}
  }
 },60000);
 it('keeps an explicitly requested bed when compact furniture is needed',()=>{
  const result=generateRecommendations(tiny,{...options,constraints:{counts:{bed:1},excludedTypes:[],keepIds:[],strictStyle:false}});
  expect(result.proposals.length,JSON.stringify(result.messages)).toBeGreaterThan(0);
  for(const p of result.proposals){expect(p.room.furniture.some(item=>item.sourceType==='bed')).toBe(true);expect(validateRecommendationLayout(p.room).valid).toBe(true);}
  expect(result.messages.join(' ')).toContain('작은');
 },60000);
 it('does not drop explicit furniture counts or a required style to force success',()=>{
  const result=generateRecommendations(tiny,{...options,constraints:{counts:{bed:2},excludedTypes:[],keepIds:[],strictStyle:true}});
  expect(result.proposals).toHaveLength(0);
 },60000);
 it('generates a safe new design for the uploaded floor without changing the original',()=>{
  const before=structuredClone(room),result=generateRecommendations(room,options);
  expect(result.proposals.length,JSON.stringify(result.messages)).toBeGreaterThan(0);
  for(const p of result.proposals){expect(validateRecommendationLayout(p.room).valid).toBe(true);expect(computeLocalValidationIssues(p.room.furniture,p.room,'render').filter(i=>i.severity==='ERROR')).toEqual([]);}
  expect(room).toEqual(before);
 },60000);
});
