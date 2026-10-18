import {beforeAll,describe,expect,it,vi} from 'vitest';
import uploaded from './uploadedRoomWithFixtures.fixture.json';
import {apiClient} from '../api/client';
import {getRecentUploadedRooms} from '../api/rooms';
import type {RoomLayout} from '../types';
import {generateRecommendations,type RecommendationOptions} from './engine';
import {createCirculationGrid,validateCirculation,validateRecommendationLayout} from './layoutValidation';
import {auditConsultationProposal} from './consultationAudit';
import {buildDemoValidationReport} from '../pages/demoValidation';
import {isFixtureFurniture} from '../config/fixtureType';
let room:RoomLayout;
const options:RecommendationOptions={purpose:'휴식',style:'modern',palette:'auto',mode:'new',keepTypes:false,keepSizes:false,seed:41};
beforeAll(async()=>{
 const request=vi.spyOn(apiClient,'get').mockResolvedValue({data:{success:true,data:[uploaded]}});
 try{room=(await getRecentUploadedRooms())[0].layout;}finally{request.mockRestore();}
});
function valid(result:ReturnType<typeof generateRecommendations>) {
 expect(result.proposals.length,JSON.stringify(result.messages)).toBeGreaterThan(0);
 for(const p of result.proposals){
  expect(validateRecommendationLayout(p.room).valid).toBe(true);
  expect(buildDemoValidationReport(p.room).errors).toBe(0);
  for(const item of room.furniture.filter(isFixtureFurniture))expect(p.room.furniture.find(f=>f.id===item.id)).toEqual(item);
 }
}
describe('complete uploaded room with scanned fixtures',()=>{
 it('refines the grid rather than moving appliances or lowering the 60 cm passage width',()=>{
  const baseline={...room,furniture:room.furniture.filter(isFixtureFurniture)};
  expect(validateCirculation(baseline,createCirculationGrid(baseline,.15)).valid).toBe(false);
  expect(validateCirculation(baseline).valid).toBe(true);
  const blocked={...baseline,doors:[{...baseline.doors[0],dimensions:{...baseline.doors[0].dimensions,width:.59}}]};
  expect(validateCirculation(blocked).valid).toBe(false);
 });
 it('removes automatic furniture minimums when only a smaller composition fits',()=>{
  const tiny:RoomLayout={...room,name:'작은 원룸',width:2,depth:2.2,walls:[],windows:[],doors:[{id:'entry',label:'문',position:{x:0,z:1.1},rotationY:0,dimensions:{width:.9,depth:.1,height:2}}],furniture:[]};
  const result=generateRecommendations(tiny,options);
  expect(result.proposals.length,JSON.stringify(result.messages)).toBeGreaterThan(0);
  for(const p of result.proposals){expect(p.room.furniture.length).toBeGreaterThan(0);expect(p.room.furniture.some(f=>f.sourceType==='bed')).toBe(false);expect(validateRecommendationLayout(p.room).valid).toBe(true);}
  expect(result.messages.join(' ')).toContain('기본 구성의 종류·개수 기준을 풀고');
 },60000);
 it.each(['modern','minimal','natural','classic','midcentury'] as const)('preserves every scanned fixture when recommending %s',style=>{
  const original=structuredClone(room);
  for(const seed of [41,92])valid(generateRecommendations(room,{...options,style,seed}));
  expect(room).toEqual(original);
 },60000);
 it('applies a required style to recommended furniture while preserving unstyled scanned appliances',()=>{
  const request={...options,constraints:{counts:{bed:1},excludedTypes:['wardrobe'],keepIds:[],strictStyle:true}};
  const result=generateRecommendations(room,request);valid(result);
  for(const p of result.proposals){expect(auditConsultationProposal(p.room,request,room).valid).toBe(true);expect(p.room.furniture.filter(f=>f.sourceType==='bed')).toHaveLength(1);}
 },60000);
});
