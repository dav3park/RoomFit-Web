import {describe,expect,it} from 'vitest';
import {DEMO_ROOMS} from '../pages/workspaceDemoState';
import type {RoomLayout,Vector2D} from '../types';
import {generateRecommendations,type RecommendationOptions} from './engine';
import {validateRecommendationLayout} from './layoutValidation';
import {buildDemoValidationReport} from '../pages/demoValidation';
function floor(name:string,width:number,depth:number,points?:Vector2D[]):RoomLayout {
 const polygon=points??[{x:-width/2,z:-depth/2},{x:width/2,z:-depth/2},{x:width/2,z:depth/2},{x:-width/2,z:depth/2}];
 return {...DEMO_ROOMS[0],id:name,name:name+' 원룸',width,depth,height:2.7,furniture:[],windows:[],
  walls:polygon.map((start,i)=>({id:'wall-'+i,start,end:polygon[(i+1)%polygon.length],height:2.7,thickness:.1})),
  doors:[{id:'entry',label:'출입문',wallId:'wall-0',position:{x:0,z:-depth/2},rotationY:0,dimensions:{width:.9,depth:.1,height:2}}]};
}
const rooms=[floor('초소형',2,2.2),floor('좁은 방',2.4,2.8),floor('긴 방',2.2,5),floor('일반 원룸',3.4,3.5),floor('시연 크기',6.5,4),floor('넓은 방',8,6),
 floor('ㄱ자',4.8,4.8,[{x:-2.4,z:-2.4},{x:2.4,z:-2.4},{x:2.4,z:2.4},{x:-.3,z:2.4},{x:-.3,z:.3},{x:-2.4,z:.3}]),
 floor('중앙이 좁은 방',4,4.8,[{x:-2,z:-2.4},{x:2,z:-2.4},{x:2,z:2.4},{x:-2,z:2.4},{x:-2,z:.7},{x:-1,z:.7},{x:-1,z:-.7},{x:-2,z:-.7}])];
const multi=floor('복수 출입문과 창문',4,4.5);
multi.doors.push({...multi.doors[0],id:'entry2',wallId:'wall-2',position:{x:1.1,z:multi.depth/2},dimensions:{...multi.doors[0].dimensions,width:.74}});
multi.windows=[{id:'window1',label:'창1',wallId:'wall-1',position:{x:2,z:-.7},rotationY:Math.PI/2,dimensions:{width:1.2,depth:.1,height:1.3},sillHeight:.8},
 {id:'window2',label:'창2',wallId:'wall-3',position:{x:-2,z:.7},rotationY:Math.PI/2,dimensions:{width:1.2,depth:.1,height:1.3},sillHeight:.8}];
rooms.push(multi);
rooms.push({...floor('문 정보 없는 방',3,3.5),doors:[]});
const corridor=floor('좁은 양쪽 출입문 방',1.1,4);
corridor.doors.push({...corridor.doors[0],id:'far-entry',wallId:'wall-2',position:{x:0,z:2}});
rooms.push(corridor);
const styles=['minimal','natural','modern','classic','midcentury'] as const;
const purposes=['휴식','업무 / 공부','취미 / 여가','수납'] as const;
const cases=rooms.flatMap((room,i)=>purposes.map((purpose,j)=>({room,purpose,style:styles[(i+j)%styles.length]})));
describe('recommendations across room shapes and automatic furnishing needs',()=>{
 it.each(cases)('$room.name / $purpose / $style',({room,purpose,style})=>{
  const original=structuredClone(room);
  const options:RecommendationOptions={purpose,style,palette:'auto',mode:'new',keepTypes:false,keepSizes:false,seed:92};
  for(const seed of [41,92]){
  const result=generateRecommendations(room,{...options,seed});
  expect(result.proposals.length,JSON.stringify(result.messages)).toBeGreaterThan(0);
  for(const p of result.proposals){expect(p.room.furniture.length).toBeGreaterThan(0);expect(validateRecommendationLayout(p.room).valid,JSON.stringify(p.validation)).toBe(true);expect(buildDemoValidationReport(p.room).errors).toBe(0);}
  }
  expect(room).toEqual(original);
 },60000);
});
