import { describe,it,expect } from 'vitest';
import type { Furniture,RoomLayout } from '../types';
import { rolePlacementCandidates,rolePlacementScore } from './rolePlacement';
const room={id:'roles',name:'',width:6,depth:6,height:2.7,walls:[],doors:[],windows:[],furniture:[]} satisfies RoomLayout;
const item=(id:string,type:string,x=0,z=0):Furniture=>({id,name:id,sourceType:type,category:'cabinet',position:{x,z},rotationY:0,dimensions:{width:1,depth:.3,height:1.4},material:'wood',color:'#aaa',status:'recommended',removable:true});
describe('purpose-specific placement',()=>{
 it('places dividers across the line between real sleeping and work areas',()=>{
  const bed=item('bed','bed',-2,0),desk=item('desk','desk',2,0),divider=item('divider','partition_shelf');
  const poses=rolePlacementCandidates(room,divider,[bed,desk]);expect(poses.length).toBeGreaterThan(0);
  expect(poses[0].position.x).toBeCloseTo(-.2);expect(poses[0].position.z).toBe(0);expect(Math.abs(Math.sin(poses[0].rotationY))).toBeCloseTo(1);
  expect(rolePlacementScore(room,poses[0],[bed,desk])).toBeGreaterThan(rolePlacementScore(room,{...divider,position:{x:2,z:2}},[bed,desk]));
 });
 it('does not invent separation when only one living area exists',()=>{
  expect(rolePlacementCandidates(room,item('divider','partition_shelf'),[item('bed','bed')])).toEqual([]);
 });
 it('places coffee tables in front of a sofa and rugs inside the living group',()=>{
  const sofa=item('sofa','sofa',0,1);sofa.dimensions.depth=1;
  const table={...item('coffee','side_table'),variantId:'side-table-coffee'};
  expect(rolePlacementCandidates(room,table,[sofa])[0].position.z).toBeGreaterThan(1.5);
  expect(rolePlacementCandidates(room,item('rug','rug'),[sofa])[0].position.z).toBeCloseTo(1.65);
 });
});
