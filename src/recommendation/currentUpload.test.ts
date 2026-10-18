import {beforeAll,expect,it,vi} from 'vitest';
import raw from './currentUpload.fixture.json';
import {apiClient} from '../api/client';
import {getRecentUploadedRooms} from '../api/rooms';
import type {RoomLayout} from '../types';
import {isFixtureFurniture,isImmovableFixture} from '../config/fixtureType';
import {demoOverlapHighlights} from '../pages/demoPlacement';
import {buildDemoValidationReport} from '../pages/demoValidation';
import {generateRecommendations} from './engine';
import {validateRecommendationLayout} from './layoutValidation';
let room:RoomLayout;
beforeAll(async()=>{
 const request=vi.spyOn(apiClient,'get').mockResolvedValue({data:{success:true,data:[raw]}});
 try{room=(await getRecentUploadedRooms())[0].layout;}finally{request.mockRestore();}
});
it('treats existing scanned fixtures as fixed room context without repair warnings',()=>{
 const baseline={...room,furniture:room.furniture.filter(isFixtureFurniture)};
 expect(validateRecommendationLayout(baseline).valid).toBe(true);
 expect(buildDemoValidationReport(baseline).items).toHaveLength(0);
 const state=demoOverlapHighlights(baseline);
 for(const item of baseline.furniture.filter(isImmovableFixture)){
  expect(state.status.get(item.id)).toBe('clear');expect(state.reasons.get(item.id)).toBeUndefined();expect(state.clearance.has(item.id)).toBe(false);
 }
});
it.each(['minimal','natural','modern','classic','midcentury'] as const)('preserves every current fixture without lock flags for %s',style=>{
 const input={...room,furniture:room.furniture.map(f=>({...f,recommendationLocked:false}))};
 const original=structuredClone(input);
 for(const seed of [41,92]){
 const result=generateRecommendations(input,{purpose:'휴식',style,palette:'auto',mode:'new',keepTypes:false,keepSizes:false,seed});
 expect(result.proposals.length,JSON.stringify(result.messages)).toBeGreaterThan(0);
 for(const p of result.proposals){
  for(const f of input.furniture.filter(isFixtureFurniture))expect(p.room.furniture.find(n=>n.id===f.id)).toEqual(f);
  expect(validateRecommendationLayout(p.room).valid).toBe(true);expect(buildDemoValidationReport(p.room).errors).toBe(0);
 }
 }
 expect(input).toEqual(original);
},60000);
it('still reports new movable furniture colliding with a fixture, on the movable furniture only',()=>{
 const base=room.furniture.find(f=>f.sourceType==='base_cabinet')!;
 const desk={...room.furniture.find(f=>f.sourceType==='desk')!,position:{...base.position},dimensions:{width:.5,depth:.5,height:.7},rotationY:base.rotationY};
 const input={...room,furniture:[base,desk]};
 const state=demoOverlapHighlights(input);
 expect(state.status.get(base.id)).toBe('clear');expect(state.status.get(desk.id)).toBe('blocked');
 expect(state.findings.some(f=>f.type==='BODY_COLLISION'&&f.furnitureId===desk.id&&f.otherFurnitureId===base.id)).toBe(true);
 expect(validateRecommendationLayout(input).valid).toBe(false);
});
