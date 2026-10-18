import type { Furniture, RoomLayout, Vector2D } from '../types';
import { resolveFurnitureLocalFootprint } from '../components/room/furnitureBoundary';
import { clearanceZonesWorld } from '../geometry/clearance';
import { obbOverlap } from '../geometry/obb';
import { demoFloorContains } from '../pages/demoPlacement';
import { doorFrame, furnitureType, prepareFurniture } from './layoutValidation';

// Functional relationships, balance and alignment follow Merrell et al. (2011).
// Weights/thresholds below are RoomFit heuristics, not the paper's fitted model.
export function localPosition(item: Furniture, point: Vector2D): Vector2D {
  const dx=point.x-item.position.x,dz=point.z-item.position.z,c=Math.cos(item.rotationY),s=Math.sin(item.rotationY);
  return {x:dx*c-dz*s,z:dx*s+dz*c};
}
export function worldPosition(item: Furniture, x: number, z: number): Vector2D {
  const c=Math.cos(item.rotationY),s=Math.sin(item.rotationY);
  return {x:item.position.x+x*c+z*s,z:item.position.z-x*s+z*c};
}
export function nearestWall(room: RoomLayout, point: Vector2D) {
  return room.walls.map(wall=>{
    const dx=wall.end.x-wall.start.x,dz=wall.end.z-wall.start.z,len=Math.hypot(dx,dz)||1;
    const t=Math.max(0,Math.min(1,((point.x-wall.start.x)*dx+(point.z-wall.start.z)*dz)/(len*len)));
    return {wall,distance:Math.hypot(point.x-wall.start.x-t*dx,point.z-wall.start.z-t*dz)};
  }).sort((a,b)=>a.distance-b.distance)[0];
}
export function floorCentroid(room: RoomLayout): Vector2D {
  let twiceArea=0,x=0,z=0;
  for(const wall of room.walls) {
    const cross=wall.start.x*wall.end.z-wall.end.x*wall.start.z;
    twiceArea+=cross;x+=(wall.start.x+wall.end.x)*cross;z+=(wall.start.z+wall.end.z)*cross;
  }
  return Math.abs(twiceArea)>.01?{x:x/(3*twiceArea),z:z/(3*twiceArea)}:{x:0,z:0};
}

/** A chair is useful at its desk, not at an arbitrary empty wall. */
export function functionalPlacement(item: Furniture, placed: readonly Furniture[]): boolean {
  if(furnitureType(item)!=='desk_chair'||!placed.some(other=>furnitureType(other)==='desk')) return true;
  return placed.filter(other=>furnitureType(other)==='desk').some(desk=>{
    const point=localPosition(desk,item.position),bounds=resolveFurnitureLocalFootprint(desk);
    return Math.abs(point.x-(bounds.minX+bounds.maxX)/2)<=Math.max(.3,desk.dimensions.width*.3)
      && point.z>=bounds.maxZ-.1 && point.z<=bounds.maxZ+item.dimensions.depth+.4
      && Math.cos(item.rotationY-desk.rotationY)<-.9;
  });
}

export function relatedPoses(item: Furniture, placed: readonly Furniture[]): Furniture[] {
  const type=furnitureType(item),local=resolveFurnitureLocalFootprint(item);
  const poses:Furniture[]=[];
  for(const other of placed) {
    const otherType=furnitureType(other),bounds=resolveFurnitureLocalFootprint(other);
    if(type==='desk_chair'&&otherType==='desk') {
      for(const shift of [0,-.15,.15]) poses.push({...item,position:worldPosition(other,shift,bounds.maxZ+local.maxZ+.12),rotationY:other.rotationY+Math.PI});
    }
    if(['nightstand','side_table'].includes(type)&&['bed','sofa_bed','sofa'].includes(otherType)) {
      for(const side of [-1,1]) poses.push({...item,position:worldPosition(other,side*(other.dimensions.width/2+item.dimensions.width/2+.12),bounds.minZ+item.dimensions.depth/2+.12),rotationY:other.rotationY});
    }
    if(type==='multi_table'&&otherType==='sofa') {
      poses.push({...item,position:worldPosition(other,0,bounds.maxZ-local.minZ+.45),rotationY:other.rotationY});
    }
  }
  return poses;
}

export function designScore(items: readonly Furniture[], room: RoomLayout, focus: number): number {
  const center=floorCentroid(room),entries=items.map(prepareFurniture);
  let score=0,mass=0,mx=0,mz=0;
  const physical=entries.filter(entry=>!['rug','curtain_blind','monitor','tv'].includes(entry.type));
  for(const entry of physical) {
    const item=entry.item,local=resolveFurnitureLocalFootprint(item),wall=nearestWall(room,item.position);
    const weight=(local.maxX-local.minX)*(local.maxZ-local.minZ);
    mass+=weight;mx+=(item.position.x-center.x)*weight;mz+=(item.position.z-center.z)*weight;
    if(wall) {
      const angle=-Math.atan2(wall.wall.end.z-wall.wall.start.z,wall.wall.end.x-wall.wall.start.x);
      score+=2*Math.cos(4*(item.rotationY-angle));
      // Backs of beds/storage/seats against a wall, usable front toward the room.
      if(['bed','sofa_bed','sofa','wardrobe','bookshelf','drawer_chest','media_console'].includes(entry.type)) {
        const back=worldPosition(item,0,local.minZ);
        score-=Math.min(3,nearestWall(room,back)?.distance??3)*(['bed','sofa_bed'].includes(entry.type)?14:8);
      }
    }
    const front=worldPosition(item,0,local.maxZ+.5);
    if(!demoFloorContains(room,front)) score-=8;
    // Count invaded approach zones; hard opening/body checks are separate.
    for(const zone of clearanceZonesWorld({...item,sourceType:entry.type,rotationY:-item.rotationY})) {
      if(zone.corners.some(point=>!demoFloorContains(room,point))) score-=3;
      for(const other of entries) if(other!==entry&&!['rug','curtain_blind','monitor','tv'].includes(other.type)
        &&!(entry.type==='desk'&&other.type==='desk_chair')&&obbOverlap(zone.corners,other.body)) score-=5;
    }
    if(entry.type==='desk'&&room.windows.length) {
      const window=room.windows.slice().sort((a,b)=>Math.hypot(a.position.x-item.position.x,a.position.z-item.position.z)-Math.hypot(b.position.x-item.position.x,b.position.z-item.position.z))[0];
      const distance=Math.hypot(window.position.x-item.position.x,window.position.z-item.position.z);
      const direction=localPosition(item,window.position);
      // OSHA: light should enter from the side of a computer workstation.
      score+=(focus===1?7:4)*Math.abs(direction.x)/(distance||1)-Math.abs(distance-1.5)*2;
    }
    if(['wardrobe','bookshelf','partition_shelf'].includes(entry.type)) {
      for(const window of room.windows) score-=Math.max(0,1.4-Math.hypot(window.position.x-item.position.x,window.position.z-item.position.z))*6;
    }
    if(['bed','sofa_bed'].includes(entry.type)) {
      for(const door of room.doors) score-=Math.max(0,2-Math.hypot(door.position.x-item.position.x,door.position.z-item.position.z))*4;
    }
    if(['nightstand','side_table'].includes(entry.type)) {
      const hosts=physical.filter(other=>['bed','sofa_bed','sofa'].includes(other.type));
      if(hosts.length) score-=Math.min(...hosts.map(host=>{
        const p=localPosition(host.item,item.position);
        return Math.abs(Math.abs(p.x)-(host.item.dimensions.width+item.dimensions.width)/2-.12)+Math.abs(p.z+host.item.dimensions.depth/2-item.dimensions.depth/2);
      }))*5;
    }
    if(entry.type==='multi_table') {
      const sofas=physical.filter(other=>other.type==='sofa');
      if(sofas.length) score-=Math.min(...sofas.map(sofa=>{
        const p=localPosition(sofa.item,item.position);
        return Math.abs(p.x)+Math.abs(p.z-(sofa.item.dimensions.depth+item.dimensions.depth)/2-.45);
      }))*6;
    }
  }
  // Area-weighted centroid: do not reward pushing everything to the same wall.
  if(mass) score-=Math.max(0,Math.hypot(mx/mass,mz/mass)-.5)*(focus===2?10:7);
  const desks=physical.filter(entry=>entry.type==='desk');
  const beds=physical.filter(entry=>['bed','sofa_bed'].includes(entry.type));
  for(const bed of beds) for(const desk of desks) {
    const distance=Math.hypot(bed.item.position.x-desk.item.position.x,bed.item.position.z-desk.item.position.z);
    score+=Math.min(distance,3)*(focus===1?3:1.5);
  }
  // Seat faces the screen when both exist, rather than turning its back to it.
  for(const sofa of physical.filter(entry=>entry.type==='sofa')) for(const tv of entries.filter(entry=>entry.type==='tv')) {
    const p=localPosition(sofa.item,tv.item.position),distance=Math.hypot(p.x,p.z)||1;
    score+=6*p.z/distance-Math.abs(p.x)*2;
  }
  return score;
}

/** Pose-only structural difference. Product changes never count as movement. */
export function layoutDistance(a: RoomLayout, b: RoomLayout): number {
  const anchors=a.furniture.filter(item=>!['plant','mood_lamp','rug','curtain_blind','nightstand','side_table','monitor','tv','desk_chair'].includes(furnitureType(item)));
  let changes=0,total=0;
  for(const item of anchors) {
    const other=b.furniture.find(other=>other.id===item.id);
    if(!other) {changes++;total+=1;continue;}
    const movement=Math.hypot(item.position.x-other.position.x,item.position.z-other.position.z);
    const turn=Math.abs(Math.sin((item.rotationY-other.rotationY)/2));
    const wallChanged=nearestWall(a,item.position)?.wall.id!==nearestWall(b,other.position)?.wall.id;
    if((wallChanged&&movement>.75)||movement>1.2||turn>.6) changes++;
    total+=Math.min(1,movement/Math.max(a.width,a.depth))*1.5+turn*.5;
  }
  if(a.furniture.length!==b.furniture.length) changes++;
  return changes?total/Math.max(1,anchors.length):0;
}

export function designFeatures(room: RoomLayout): string[] {
  const items=room.furniture.map(prepareFurniture),features:string[]=[];
  if(room.windows.length) features.push('창 앞 높은 가구 배제');
  if(items.some(entry=>entry.type==='curtain_blind'))features.push('창문에 맞춘 커튼·블라인드');
  if(items.some(entry=>entry.type==='desk')&&items.some(entry=>entry.type==='desk_chair')) features.push('책상·의자 사용 공간 연결');
  const anchorWalls=new Set(items.filter(entry=>['bed','sofa','desk','wardrobe','bookshelf'].includes(entry.type)).map(entry=>nearestWall(room,entry.item.position)?.wall.id));
  if(anchorWalls.size>1) features.push('여러 벽에 생활 영역 분산');
  return features;
}

/** Try anchors along real wall segments, including concave/angled rooms. */
export function wallPoses(item: Furniture, room: RoomLayout): Furniture[] {
  const poses:Furniture[]=[];
  for(const wall of room.walls) {
    const middle={x:(wall.start.x+wall.end.x)/2,z:(wall.start.z+wall.end.z)/2};
    const {along,inward}=doorFrame(room,{id:wall.id,label:'',position:middle,dimensions:{width:1,height:1,depth:.1},rotationY:0,wallId:wall.id});
    const rotationY=Math.atan2(inward.x,inward.z),local=resolveFurnitureLocalFootprint(item);
    const length=Math.hypot(wall.end.x-wall.start.x,wall.end.z-wall.start.z);
    if(length<local.maxX-local.minX+.24) continue;
    const start=.12-local.minX,end=length-.12-local.maxX;
    for(const fraction of [0,.25,.5,.75,1]) {
      const distance=start+(end-start)*fraction,offset=.12-local.minZ;
      poses.push({...item,rotationY,position:{x:wall.start.x+along.x*distance+inward.x*offset,z:wall.start.z+along.z*distance+inward.z*offset}});
    }
  }
  return poses;
}
