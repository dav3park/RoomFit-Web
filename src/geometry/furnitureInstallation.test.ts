import { computeLocalValidationIssues } from './liveValidation';
import { validateRecommendationLayout } from '../recommendation/layoutValidation';
import { describe,it,expect } from 'vitest';
import type { Furniture,RoomLayout } from '../types';
import catalog from '../data/furniture/catalog.json';
import { resolveFurnitureInstallations, windowInstallationCandidates, supportFor } from './furnitureInstallation';
const room:RoomLayout={id:'installation',name:'원룸',width:6,depth:6,height:2.7,walls:[
 {id:'n',start:{x:-3,z:-3},end:{x:3,z:-3}},{id:'e',start:{x:3,z:-3},end:{x:3,z:3}},
 {id:'s',start:{x:3,z:3},end:{x:-3,z:3}},{id:'w',start:{x:-3,z:3},end:{x:-3,z:-3}}],doors:[],windows:[],furniture:[]};
function item(variant:string,id=variant):Furniture {const p=catalog.products.find(p=>p.variantId===variant)!;return {id,name:p.label,sourceType:p.furnitureType,variantId:variant,productId:p.productId,category:'cabinet',dimensions:{...p.dimensions},position:{x:0,z:0},rotationY:0,color:'#fff',material:'wood',status:'recommended',removable:true};}
describe('furniture installation',()=>{
 it('uses rectangular bounds for preview rooms with only two visible walls',()=>{
  const r={...room,walls:room.walls.slice(0,2),windows:[{id:'window',label:'창문',wallId:'n',position:{x:0,z:-3},rotationY:0,dimensions:{width:2,depth:.1,height:1.2},sillHeight:.9}]};
  const [curtain]=windowInstallationCandidates(r,item('curtain-fabric'));
  expect(curtain.position.z).toBeGreaterThan(-3);
  expect(validateRecommendationLayout({...r,furniture:[curtain]}).valid).toBe(true);
  const outside={...curtain,position:{x:-4,z:curtain.position.z}};
  expect(computeLocalValidationIssues([outside],r,'render').some(issue=>issue.type==='OUT_OF_BOUNDS')).toBe(true);
 });
 it('fits window treatments at a wall corner without requiring floor-furniture clearance',()=>{
  const r={...room,windows:[{id:'corner',label:'창문',wallId:'n',position:{x:-2,z:-3},rotationY:0,dimensions:{width:2,depth:.1,height:1.2},sillHeight:.9}]};
  for(const variant of ['curtain-fabric','blind-wood']){
   const [installed]=windowInstallationCandidates(r,item(variant));
   expect(installed).toBeDefined();
   expect(installed.dimensions.width).toBeCloseTo(variant==='curtain-fabric'?2.1:2);
   expect(validateRecommendationLayout({...r,furniture:[installed]}).valid,variant).toBe(true);
   expect(computeLocalValidationIssues([installed],r,'render').filter(issue=>issue.severity==='ERROR'),variant).toEqual([]);
   const outside={...installed,position:{...installed.position,x:-3}};
   expect(computeLocalValidationIssues([outside],r,'render').some(issue=>issue.type==='OUT_OF_BOUNDS')).toBe(true);
  }
 });
 it('uses the authored desktop surface instead of overall furniture height',()=>{
  const desk=item('desk-compact'),lamp=item('lamp-table');
  const result=resolveFurnitureInstallations(room,[desk,lamp]).get(lamp.id)!;
  expect(result.valid).toBe(true);expect(result.supportId).toBe(desk.id);expect(result.minY).toBeCloseTo(.73,2);
 });
 it('rejects unsupported or edge-overhanging tabletop lamps',()=>{
  const lamp=item('lamp-table'),desk=item('desk-compact');
  expect(resolveFurnitureInstallations(room,[lamp]).get(lamp.id)?.valid).toBe(false);
  lamp.position.x=.59;expect(supportFor(lamp,[desk])).toBeUndefined();
 });
 it('keeps support assignment stable across furniture order',()=>{
  const a=item('desk-compact','a'),b=item('desk-compact','b'),lamp=item('lamp-table');
  expect(supportFor(lamp,[b,a])?.id).toBe('a');expect(supportFor(lamp,[a,b])?.id).toBe('a');
 });
 it('does not accept a central curtain simply because the room has a window',()=>{
  const curtain=item('curtain-fabric');const withWindow={...room,windows:[{id:'window',label:'창문',wallId:'n',position:{x:0,z:-3},rotationY:0,dimensions:{width:2,depth:.1,height:1.2},sillHeight:.9}]};
  expect(resolveFurnitureInstallations(withWindow,[curtain]).get(curtain.id)?.valid).toBe(false);
  const [installed]=windowInstallationCandidates(withWindow,curtain);expect(installed).toBeDefined();
  const result=resolveFurnitureInstallations(withWindow,[installed]).get(curtain.id)!;
  expect(result.valid).toBe(true);expect(result.openingId).toBe('window');expect(result.minY).toBe(0);expect(result.maxY).toBeCloseTo(2.2);
  expect(resolveFurnitureInstallations(room,[curtain]).get(curtain.id)?.valid).toBe(false);
 });
 it('rejects two window treatments on the same opening',()=>{
  const r={...room,windows:[{id:'one',label:'창문',wallId:'n',position:{x:0,z:-3},rotationY:0,dimensions:{width:2,depth:.1,height:1.2}}]};
  const [a]=windowInstallationCandidates(r,item('curtain-fabric','a'));
  const b={...a,id:'b'};const result=resolveFurnitureInstallations(r,[b,a]);
  expect([...result.values()].filter(p=>p.valid)).toHaveLength(1);expect(result.get('a')?.valid).toBe(true);
 });
 it('uses cabinet tops rather than bottom shelves and the clear corner desktop',()=>{
  for(const [variant,height] of [['expansion-c070',.484],['expansion-c071',.6425],['media-console-open',.64]] as const){
   const host=item(variant),screen=item('tv-small');
   expect(resolveFurnitureInstallations(room,[host,screen]).get(screen.id)?.minY,variant).toBeCloseTo(height,6);
  }
  const desk=item('desk-corner'),screen=item('monitor-basic');screen.position={x:.05,z:.09};
  const installed=resolveFurnitureInstallations(room,[screen,desk]).get(screen.id)!;
  expect(installed.valid).toBe(true);expect(installed.minY).toBeCloseTo(.755,6);
 });
 it('validates complete snapshots independently of support/dependent array order',()=>{
  const desk=item('desk-compact'),lamp=item('lamp-table');
  expect(validateRecommendationLayout({...room,furniture:[desk,lamp]}).valid).toBe(true);
  expect(validateRecommendationLayout({...room,furniture:[lamp,desk]}).valid).toBe(true);
 });

 it('keeps window treatments within thick wall boundaries in both live and final validation',()=>{
  const r={...room,walls:room.walls.map(w=>({...w,thickness:.2})),windows:[{id:'window',label:'창문',wallId:'n',position:{x:0,z:-3},rotationY:0,dimensions:{width:2,depth:.1,height:1.2},sillHeight:.9}]};
  const [curtain]=windowInstallationCandidates(r,item('curtain-fabric'));const installed={...r,furniture:[curtain]};
  expect(validateRecommendationLayout(installed).valid).toBe(true);
  expect(computeLocalValidationIssues([curtain],r,'render').filter(issue=>issue.severity==='ERROR')).toEqual([]);
 });

 it('rejects low furniture crossing a floor-length curtain regardless of order',()=>{
  const r={...room,windows:[{id:'window',label:'창문',wallId:'n',position:{x:0,z:-3},rotationY:0,dimensions:{width:2,depth:.1,height:1.2},sillHeight:.9}]};
  const [curtain]=windowInstallationCandidates(r,item('curtain-fabric'));const bed=item('bed-low-platform');bed.position={x:0,z:-1.89};
  for(const furniture of [[curtain,bed],[bed,curtain]])expect(validateRecommendationLayout({...r,furniture}).valid).toBe(false);
 });

});
