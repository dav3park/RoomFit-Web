import {expect,it} from 'vitest';
import fixture from './layoutRegression.fixture.json';
import type {Furniture,RoomLayout} from '../types';
import {validateCirculation,validateRecommendationLayout} from './layoutValidation';

it.each(['sink','stove'].flatMap(type=>[false,true].map(counter=>({type,counter}))))('requires reachable $type access with counter=$counter',({type,counter})=>{
 const appliance:Furniture={id:'appliance',name:type,category:'fixture',sourceType:type,mount:'WALL',elevation:.8,
  dimensions:{width:.6,depth:.5,height:.1},position:{x:0,z:-1.7},rotationY:0,color:'#fff',material:'wood',status:'existing',removable:false};
 const divider:Furniture={...appliance,id:'divider',name:'divider',category:'cabinet',sourceType:'bookshelf',mount:undefined,elevation:undefined,
  dimensions:{width:3.75,depth:.3,height:1.8},position:{x:0,z:0}};
 const base:Furniture={...divider,id:'counter',name:'counter',category:'fixture',sourceType:'base_cabinet',
  dimensions:{width:1.8,depth:.8,height:.9},position:{x:0,z:-1.6}};
 const appliances=counter?[appliance,base]:[appliance];
 const room:RoomLayout={...fixture as RoomLayout,width:4,depth:4,height:2.4,walls:[],windows:[],
  doors:[{id:'entry',label:'문',position:{x:0,z:2},rotationY:0,dimensions:{width:.9,depth:.1,height:2}}],furniture:[...appliances,divider]};
 expect(validateCirculation({...room,furniture:appliances}).valid).toBe(true);
 expect(validateCirculation(room).reasons).toContain(`${type}: 사용 위치까지 통로가 연결되지 않습니다.`);
 expect(validateRecommendationLayout(room).valid).toBe(false);
});
