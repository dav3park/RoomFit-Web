import {describe,it,expect} from 'vitest';
import {buildDemoValidationReport} from '../demoValidation';
import {demoOverlapHighlights,demoDoorSwing} from '../demoPlacement';
import {DEMO_ROOMS,copyDemoRoom} from '../workspaceDemoState';
import {localClearanceRects} from '../../geometry/clearance';
const room=()=>{const r=copyDemoRoom(DEMO_ROOMS[0]);r.doors=[];r.furniture=[];return r;};
const item=(id:string,name:string,type='bed')=>({...DEMO_ROOMS[0].furniture[0],id,name,sourceType:type,variantId:null,rotationY:0,position:{x:0,z:0},dimensions:{width:1,depth:1,height:1}});
describe('structured placement report',()=>{
 it('shows one named collision pair and suppresses duplicate clearance symptoms',()=>{
  const r=room();r.furniture=[item('bed','침대'),item('shelf','책장','bookshelf')];
  const result=buildDemoValidationReport(r);
  expect(result.items).toHaveLength(1);expect(result.items[0].kind).toBe('collision');
  expect(result.items[0].furniture.map(item=>item.label)).toEqual(['침대','책장']);
  expect(result.errors).toBe(1);expect(result.warnings).toBe(0);
  r.furniture=[r.furniture[0]];expect(buildDemoValidationReport(r).items).toHaveLength(0);
 });
 it('identifies the furniture blocking a rotated opening and agrees with 3D highlights',()=>{
  const r=room(),owner={...item('wardrobe','옷장','wardrobe'),rotationY:Math.PI/2,dimensions:{width:.5,depth:.5,height:1}};
  r.furniture=[owner,{...item('plant','화분','plant'),dimensions:{width:.05,depth:.05,height:.5},position:{x:.3,z:0}}];
  expect(demoOverlapHighlights(r).status.get('wardrobe')).toBe('blocked');
  const report=buildDemoValidationReport(r);
  expect(report.items).toHaveLength(1);expect(report.items[0].kind).toBe('opening');
  expect(report.items[0].messages.join(' ')).toContain('옷장 전면 개폐 공간');
  expect(report.items[0].messages.join(' ')).toContain('화분');expect(report.errors).toBe(1);
 });
 it('retains a separate furniture obstruction when its owner also crosses the room boundary',()=>{
  const r=room();r.width=4;r.depth=4;r.walls=[];
  r.furniture=[{...item('wardrobe','옷장','wardrobe'),position:{x:1.7,z:0}},
   {...item('plant','화분','plant'),dimensions:{width:.1,depth:.1,height:.5},position:{x:1.7,z:.7}}];
  const state=demoOverlapHighlights(r);
  expect(state.findings.some(finding=>finding.type==='ZONE_INTRUSION'&&finding.furnitureId==='wardrobe'&&finding.otherFurnitureId==='plant')).toBe(true);
  const report=buildDemoValidationReport(r,state);
  expect(report.items.some(finding=>finding.kind==='boundary')).toBe(true);
  expect(report.items.some(finding=>finding.kind==='opening'&&finding.furniture.map(item=>item.id).includes('plant'))).toBe(true);
 });
 it('distinguishes warning-only access obstruction and disambiguates repeated product names',()=>{
  const r=room(),owner=item('a','침대'),front=localClearanceRects(owner).find(zone=>zone.side==='front')!;
  r.furniture=[owner,{...item('b','침대'),dimensions:{width:.05,depth:.05,height:.5},position:{x:0,z:front.minZ+.03}}];
  const report=buildDemoValidationReport(r);
  expect(report.errors).toBe(0);expect(report.warnings).toBeGreaterThan(0);
  expect(report.items[0].furniture.map(item=>item.label)).toEqual(['침대 (1)','침대 (2)']);
  r.furniture[1].status='deleted';expect(buildDemoValidationReport(r).items).toHaveLength(0);
 });
 it('lists assumed door swing obstruction and a body outside the room explicitly',()=>{
  const r=copyDemoRoom(DEMO_ROOMS[0]),swing=demoDoorSwing(r,r.doors[0]),h=swing[0],a=swing[1],b=swing.at(-1)!;
  r.furniture=[{...item('block','의자','desk_chair'),dimensions:{width:.2,depth:.2,height:.5},position:{x:h.x+.3*(a.x+b.x-2*h.x),z:h.z+.3*(a.z+b.z-2*h.z)}}];
  expect(buildDemoValidationReport(r).items.some(item=>item.kind==='opening'&&item.messages.some(text=>text.includes('90°')))).toBe(true);
  r.doors=[];r.furniture=[{...item('outside','책장','bookshelf'),position:{x:r.width,z:0}}];
  const report=buildDemoValidationReport(r);expect(report.items).toHaveLength(1);expect(report.items[0].kind).toBe('boundary');
 });
});
