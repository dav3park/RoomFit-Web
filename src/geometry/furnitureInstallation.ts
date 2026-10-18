import { placementPolicy } from '../config/furniturePlacementPolicy';
import { calculateRotatedFootprint, resolveFurnitureLocalFootprint } from '../components/room/furnitureBoundary';
import { windowCenterY } from '../components/room/openingLayout';
import { normalizeCanonicalFurnitureType } from '../config/canonicalFurnitureType';
import type { Furniture,Opening,RoomLayout,Vector2D } from '../types';
export interface ResolvedFurnitureInstallation {
 valid:boolean;reason?:string;supportId?:string;openingId?:string;
 position:[number,number,number];rotationY:number;scale:[number,number,number];minY:number;maxY:number;
}
const distance=(a:Vector2D,b:Vector2D)=>Math.hypot(a.x-b.x,a.z-b.z);
export function localPoint(item:Furniture,p:Vector2D) {
 const dx=p.x-item.position.x,dz=p.z-item.position.z,c=Math.cos(item.rotationY),s=Math.sin(item.rotationY);
 return {x:dx*c-dz*s,z:dx*s+dz*c};
}
export function floorContains(room:Pick<RoomLayout,'width'|'depth'|'walls'>,p:Vector2D):boolean {
 if(room.walls.length<3)return Math.abs(p.x)<=room.width/2+1e-6&&Math.abs(p.z)<=room.depth/2+1e-6;
 let inside=false;
 for(const wall of room.walls){const a=wall.start,b=wall.end;
  if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
 }return inside;
}
export function openingFrame(room:Pick<RoomLayout,'width'|'depth'|'walls'>,opening:Opening) {
 const distanceToWall=(wall:RoomLayout['walls'][number])=>{const dx=wall.end.x-wall.start.x,dz=wall.end.z-wall.start.z;
  const t=Math.max(0,Math.min(1,((opening.position.x-wall.start.x)*dx+(opening.position.z-wall.start.z)*dz)/(dx*dx+dz*dz||1)));
  return distance(opening.position,{x:wall.start.x+t*dx,z:wall.start.z+t*dz});};
 const wall=room.walls.find(w=>w.id===opening.wallId)??room.walls.slice().sort((a,b)=>distanceToWall(a)-distanceToWall(b)||a.id.localeCompare(b.id))[0];
 const dx=wall?wall.end.x-wall.start.x:Math.cos(opening.rotationY),dz=wall?wall.end.z-wall.start.z:-Math.sin(opening.rotationY),len=Math.hypot(dx,dz)||1;
 const along={x:dx/len,z:dz/len};let inward={x:-along.z,z:along.x};
 if(!floorContains(room,{x:opening.position.x+inward.x*.3,z:opening.position.z+inward.z*.3}))inward={x:-inward.x,z:-inward.z};
 // Local +Z faces inward in Three.js.
 const rotationY=Math.atan2(inward.x,inward.z);
 return {along,inward,rotationY,wall};
}
function scaledSurface(support:Furniture) {
 const policy=placementPolicy(support),surface=policy.surface;if(!surface)return undefined;
 const source=policy.sourceDimensions??support.dimensions,sx=support.dimensions.width/source.width,sy=support.dimensions.height/source.height,sz=support.dimensions.depth/source.depth;
 return {height:surface.height*sy,minX:surface.minX*sx,maxX:surface.maxX*sx,minZ:surface.minZ*sz,maxZ:surface.maxZ*sz};
}
export function supportFor(item:Furniture,items:readonly Furniture[]):Furniture|undefined {
 const policy=placementPolicy(item);if(policy.installation!=='SUPPORT')return undefined;
 const type=policy.canonicalType??normalizeCanonicalFurnitureType(item.sourceType),screen=type==='monitor'||type==='tv';
 return items.filter(other=>other.id!==item.id&&other.status!=='deleted'&&policy.supportTypes?.includes(placementPolicy(other).canonicalType??normalizeCanonicalFurnitureType(other.sourceType)??'')).filter(other=>{
  const surface=scaledSurface(other);if(!surface&&(!screen||placementPolicy(other).sourceDimensions))return false;
  const rect=surface??resolveFurnitureLocalFootprint(other),center=localPoint(other,item.position);
  if(screen)return center.x>=rect.minX-1e-6&&center.x<=rect.maxX+1e-6&&center.z>=rect.minZ-1e-6&&center.z<=rect.maxZ+1e-6;
  const local=resolveFurnitureLocalFootprint(item),c=Math.cos(item.rotationY),s=Math.sin(item.rotationY);
  return [[local.minX,local.minZ],[local.maxX,local.minZ],[local.maxX,local.maxZ],[local.minX,local.maxZ]].every(([x,z])=>{
   const p=localPoint(other,{x:item.position.x+x*c+z*s,z:item.position.z-x*s+z*c});
   return p.x>=rect.minX-1e-6&&p.x<=rect.maxX+1e-6&&p.z>=rect.minZ-1e-6&&p.z<=rect.maxZ+1e-6;
  });
 }).sort((a,b)=>distance(a.position,item.position)-distance(b.position,item.position)||a.id.localeCompare(b.id))[0];
}
function windowTarget(room:RoomLayout,item:Furniture,opening:Opening) {
 const policy=placementPolicy(item),frame=openingFrame(room,opening),wallHeight=room.height??2.4;
 const bottom=windowCenterY(opening.dimensions.height,wallHeight,opening.sillHeight)-opening.dimensions.height/2;
 const height=policy.windowTreatment==='BLIND'?opening.dimensions.height:Math.min(wallHeight,bottom+opening.dimensions.height+.1);
 const length=frame.wall?distance(frame.wall.start,frame.wall.end):Infinity;
 const center=frame.wall?(opening.position.x-frame.wall.start.x)*frame.along.x+(opening.position.z-frame.wall.start.z)*frame.along.z:Infinity;
 const left=policy.windowTreatment==='BLIND'?0:frame.wall?Math.min(.1,Math.max(0,center-opening.dimensions.width/2)):.1;
 const right=policy.windowTreatment==='BLIND'?0:frame.wall?Math.min(.1,Math.max(0,length-center-opening.dimensions.width/2)):.1;
 const width=opening.dimensions.width+left+right,shift=(right-left)/2,offset=item.dimensions.depth/2+(frame.wall?.thickness??.12)/2+.03;
 return {position:{x:opening.position.x+frame.inward.x*offset+frame.along.x*shift,z:opening.position.z+frame.inward.z*offset+frame.along.z*shift},rotationY:frame.rotationY,
  dimensions:{width,depth:item.dimensions.depth,height},bottom:policy.windowTreatment==='BLIND'?bottom:0};
}
/** Installed items may meet a wall; their scanned footprint must still stay on the actual floor. */
export function furnitureFootprintInsideFloor(room:Pick<RoomLayout,'width'|'depth'|'walls'>,item:Furniture):boolean {
 const footprint=calculateRotatedFootprint(item.dimensions,-item.rotationY,resolveFurnitureLocalFootprint(item));
 const corners=footprint.corners.map(p=>({x:item.position.x+p.x*(1-1e-7),z:item.position.z+p.z*(1-1e-7)}));
 const cross=(a:Vector2D,b:Vector2D,c:Vector2D)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 return floorContains(room,item.position)&&corners.every(p=>floorContains(room,p))&&!corners.some((a,i)=>{
  const b=corners[(i+1)%corners.length];
  return room.walls.some(({start:c,end:d})=>cross(a,b,c)*cross(a,b,d)<-1e-10&&cross(c,d,a)*cross(c,d,b)<-1e-10);
 });
}
export const windowFurnitureInsideRoom=furnitureFootprintInsideFloor;
export function windowInstallationCandidates(room:RoomLayout,item:Furniture):Furniture[] {
 return room.windows.slice().sort((a,b)=>distance(a.position,item.position)-distance(b.position,item.position)||a.id.localeCompare(b.id)).slice(0,4).flatMap(opening=>{
  const target=windowTarget(room,item,opening),source=placementPolicy(item).sourceDimensions??item.dimensions;
  const scales=[target.dimensions.width/source.width,target.dimensions.height/source.height];
  return scales.some(scale=>scale<.5||scale>2)?[]:[{...item,position:target.position,rotationY:target.rotationY,dimensions:target.dimensions}];
 });
}
export function resolveFurnitureInstallations(room:RoomLayout,items:readonly Furniture[]):ReadonlyMap<string,ResolvedFurnitureInstallation> {
 const results=new Map<string,ResolvedFurnitureInstallation>(),usedWindows=new Set<string>();
 const active=items.filter(item=>item.status!=='deleted');
 for(const item of active.slice().sort((a,b)=>a.id.localeCompare(b.id))){
  const p=placementPolicy(item),source=p.sourceDimensions??item.dimensions;
  let bottom=0,reason:string|undefined,supportId:string|undefined,openingId:string|undefined;
  if(p.installation==='SUPPORT'){
   const support=supportFor(item,active);supportId=support?.id;
   if(!support)reason='가구를 올려놓을 수 있는 받침과 상판 공간이 필요합니다.';
   else{const sp=placementPolicy(support);bottom=(sp.installation==='WALL'?(sp.mountBottom??0):0)+(scaledSurface(support)?.height??support.dimensions.height);}
  }else if(p.installation==='WALL'){
   bottom=p.mountBottom??0;
   const back={x:item.position.x-Math.sin(item.rotationY)*item.dimensions.depth/2,z:item.position.z-Math.cos(item.rotationY)*item.dimensions.depth/2};
   const near=room.walls.length?room.walls.some(wall=>{const dx=wall.end.x-wall.start.x,dz=wall.end.z-wall.start.z,len=Math.hypot(dx,dz)||1;
    const back={x:item.position.x-Math.sin(item.rotationY)*item.dimensions.depth/2,z:item.position.z-Math.cos(item.rotationY)*item.dimensions.depth/2};
    const t=((back.x-wall.start.x)*dx+(back.z-wall.start.z)*dz)/(len*len);
    return t>=0&&t<=1&&Math.abs((back.x-wall.start.x)*dz-(back.z-wall.start.z)*dx)/len<.16;}):Math.min(Math.abs(back.x+room.width/2),Math.abs(back.x-room.width/2),Math.abs(back.z+room.depth/2),Math.abs(back.z-room.depth/2))<.16;
   if(!near&&item.mount!=='WALL')reason='벽에 설치할 위치가 필요합니다.';
  }else if(p.installation==='WINDOW'){
   const opening=room.windows.filter(w=>!usedWindows.has(w.id)).slice().sort((a,b)=>distance(a.position,item.position)-distance(b.position,item.position)||a.id.localeCompare(b.id)).find(w=>{
    const t=windowTarget(room,item,w);
    if([t.dimensions.width/source.width,t.dimensions.height/source.height].some(scale=>scale<.5||scale>2))return false;
    return distance(t.position,item.position)<.025&&Math.cos(t.rotationY-item.rotationY)>.999
      &&Math.abs(t.dimensions.width-item.dimensions.width)<.025&&Math.abs(t.dimensions.height-item.dimensions.height)<.025;});
   if(!opening)reason='창문의 위치·방향·설치 크기에 맞게 배치해야 합니다.';
   else{openingId=opening.id;usedWindows.add(opening.id);bottom=windowTarget(room,item,opening).bottom;}
  }else if(p.installation==='FLOOR_CEILING'&&Math.abs(item.dimensions.height-(room.height??2.4))>.01)reason='바닥·천장 고정형 가구와 방 높이가 맞지 않습니다.';
  const maxY=bottom+item.dimensions.height;
  if(maxY>(room.height??3)+1e-6)reason='설치한 가구가 천장 높이를 넘습니다.';
  results.set(item.id,{valid:!reason,reason,supportId,openingId,minY:bottom,maxY,position:[item.position.x,bottom+item.dimensions.height/2,item.position.z],rotationY:item.rotationY,
   scale:[item.dimensions.width/source.width,item.dimensions.height/source.height,item.dimensions.depth/source.depth]});
 }return results;
}
