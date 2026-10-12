import { describe, it, expect } from 'vitest';
import { generateRecommendations, type RecommendationOptions } from './engine';
import { validateCirculation, validateRecommendationLayout } from './layoutValidation';
import type { RoomLayout, Furniture } from '../types';
import catalog from '../data/furniture/catalog.json';
const room:RoomLayout={id:'test',name:'원룸 Studio',width:5.8,depth:5.4,height:2.7,walls:[{id:'n',start:{x:-2.9,z:-2.7},end:{x:2.9,z:-2.7}},{id:'e',start:{x:2.9,z:-2.7},end:{x:2.9,z:2.7}},{id:'s',start:{x:2.9,z:2.7},end:{x:-2.9,z:2.7}},{id:'w',start:{x:-2.9,z:2.7},end:{x:-2.9,z:-2.7}}],windows:[],doors:[{id:'door',label:'문',position:{x:0,z:2.7},rotationY:0,dimensions:{width:.9,depth:.1,height:2.1}}],furniture:[]};
const options:RecommendationOptions={purpose:'휴식',style:'natural',palette:'brown',mode:'new',keepTypes:false,keepSizes:false};
function box(id:string,x:number,z:number,w:number,d:number):Furniture{return {id,name:id,category:'desk',sourceType:'multi_table',position:{x,z},dimensions:{width:w,depth:d,height:.7},rotationY:0,color:'#fff',material:'wood',status:'existing',removable:true};}
describe('recommendation engine',()=>{
 it('generates distinct valid catalog layouts without changing the edited room',()=>{
  const before=structuredClone(room);const result=generateRecommendations(room,options);
  
  expect(result.proposals.length).toBe(3);expect(new Set(result.proposals.map(p=>JSON.stringify(p.room.furniture))).size).toBe(3);expect(room).toEqual(before);
  for(const p of result.proposals){expect(validateRecommendationLayout(p.room).valid).toBe(true);for(const item of p.room.furniture)expect(item.dimensions).toEqual(catalog.products.find(product=>product.productId===item.productId)?.dimensions);}
 });
 it('checks lifestyle plans',()=>{for(const purpose of ['업무 / 공부','수납','취미 / 여가'] as const){const result=generateRecommendations(room,{...options,purpose});expect(result.proposals.length).toBeGreaterThan(0);}},30000);
 it('preserves original dimensions, positions and locked pieces',()=>{
  const initial=generateRecommendations(room,options).proposals[0].room;initial.furniture[0].recommendationLocked=true;
  const result=generateRecommendations(initial,{...options,mode:'preserve',keepTypes:true,keepSizes:true});expect(result.proposals.length).toBeGreaterThan(0);
  for(const p of result.proposals){expect(p.room.furniture.find(item=>item.id===initial.furniture[0].id)).toEqual(initial.furniture[0]);for(const item of initial.furniture){const next=p.room.furniture.find(next=>next.id===item.id)!;expect(next.position).toEqual(item.position);expect(next.dimensions).toEqual(item.dimensions);expect(next.rotationY).toBe(item.rotationY);}}
 });
 it('keeps locks in a new design and respects type/count and size constraints',()=>{
  const initial=generateRecommendations(room,options).proposals[0].room;initial.furniture[0].recommendationLocked=true;
  const fresh=generateRecommendations(initial,{...options,purpose:'수납'});expect(fresh.proposals.length).toBeGreaterThan(0);
  for(const p of fresh.proposals)expect(p.room.furniture.find(item=>item.id===initial.furniture[0].id)).toEqual(initial.furniture[0]);
  const rearranged=generateRecommendations(initial,{...options,mode:'rearrange',keepTypes:true,keepSizes:true});expect(rearranged.proposals.length).toBeGreaterThan(0);
  for(const p of rearranged.proposals){expect(p.room.furniture.length).toBe(initial.furniture.length);for(const old of initial.furniture)expect(p.room.furniture.find(item=>item.id===old.id)!.dimensions).toEqual(old.dimensions);}
 },30000);
 it('rejects disconnected use positions even without body collisions',()=>{const split={...room,furniture:[box('divider',0,0,5.8,.3),box('far table',0,-1.8,1,.6)]};expect(validateCirculation(split).valid).toBe(false);});
 it('validates a concave floor and rejects furniture outside it',()=>{
  const vertices=[{x:-3,z:-3},{x:3,z:-3},{x:3,z:0},{x:0,z:0},{x:0,z:3},{x:-3,z:3}];
  const shaped={...room,width:6,depth:6,walls:vertices.map((start,i)=>({id:String(i),start,end:vertices[(i+1)%vertices.length]})),doors:[{...room.doors[0],position:{x:-1.5,z:3}}]};
  const result=generateRecommendations(shaped,options);expect(result.proposals.length).toBeGreaterThan(0);for(const p of result.proposals)expect(validateRecommendationLayout(p.room).valid).toBe(true);
  expect(validateRecommendationLayout({...shaped,furniture:[box('outside',1.5,1.5,1,1)]}).valid).toBe(false);
 },30000);
 it('reports missing door data and no feasible layout',()=>{
  expect(validateCirculation({...room,doors:[]}).warnings.join()).toContain('문 정보');
  expect(generateRecommendations({...room,width:1,depth:1,doors:[],walls:[]},options).proposals).toHaveLength(0);
  expect(generateRecommendations({...room,width:0},options).proposals).toHaveLength(0);
 });
});
