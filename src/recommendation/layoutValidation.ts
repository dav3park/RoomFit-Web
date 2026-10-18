import { resolveFurnitureInstallations,supportFor,windowFurnitureInsideRoom } from '../geometry/furnitureInstallation';
import { placementPolicy } from '../config/furniturePlacementPolicy';
import type { Furniture, Opening, RoomLayout, Vector2D } from '../types';
import { calculateRotatedFootprint, isFurnitureInsideRoom, resolveFurnitureLocalFootprint } from '../components/room/furnitureBoundary';
import { normalizeCanonicalFurnitureType } from '../config/canonicalFurnitureType';
import { clearanceZonesWorld } from '../geometry/clearance';
import { obbOverlap, worldCorners } from '../geometry/obb';
import { windowCenterY } from '../components/room/openingLayout';
import { demoDoorSwing, demoFloorContains, demoOverlapHighlights, demoPlacementReason, demoZoneIsOpening, crossesRoomWall } from '../pages/demoPlacement';

export const MIN_PASSAGE_WIDTH = .6;
export interface PreparedFurniture { item: Furniture; body: Vector2D[]; openings: Vector2D[][]; type: string }
export interface LayoutValidation { valid: boolean; reasons: string[]; warnings: string[]; freeArea: number; reachableCount: number }

export function furnitureType(item: Furniture): string {
  const canonical = normalizeCanonicalFurnitureType(item.sourceType ?? item.category);
  if (canonical) return canonical;
  if (item.category === 'cabinet') return /서랍/.test(item.name) ? 'drawer_chest' : /책장|선반/.test(item.name) ? 'bookshelf' : 'wardrobe';
  return item.category;
}
export function prepareFurniture(item: Furniture): PreparedFurniture {
  const type = furnitureType(item);
  const geometry = {...item, sourceType: type, rotationY: -item.rotationY};
  return {item, type, body: worldCorners(item.position, calculateRotatedFootprint(item.dimensions, -item.rotationY, resolveFurnitureLocalFootprint(item))),
    openings: clearanceZonesWorld(geometry).filter(zone => demoZoneIsOpening(geometry, zone.side)).map(zone => zone.corners)};
}
function supported(a: PreparedFurniture, b: PreparedFurniture) {
  if ((a.type === 'monitor' && b.type === 'desk') || (a.type === 'tv' && b.type === 'media_console')) {
    return distanceToBody(a.item.position, b.item) < 1e-6;
  }
  if (a.type === 'desk_chair' && b.type === 'desk') {
    const dx=a.item.position.x-b.item.position.x, dz=a.item.position.z-b.item.position.z;
    const cosine=Math.cos(b.item.rotationY), sine=Math.sin(b.item.rotationY);
    const local=resolveFurnitureLocalFootprint(b.item);
    return Math.abs(dx*cosine-dz*sine)<b.item.dimensions.width/2+.1
      && dx*sine+dz*cosine>=local.maxZ-a.item.dimensions.depth/2-.01;
  }
  return false;
}
export function createPlacementCheck(room: RoomLayout, installationScope?: readonly Furniture[]) {
  const swings=room.doors.map(door=>demoDoorSwing(room,door)).filter(points=>points.length>2);
  return (entry: PreparedFurniture, placed: readonly PreparedFurniture[]): boolean => {
    const item=entry.item;
    const installations=resolveFurnitureInstallations(room,installationScope??[...placed.map(other=>other.item),item]);
    if(!installations.get(item.id)?.valid)return false;
    if (Object.values(item.dimensions).some(value=>!Number.isFinite(value)||value<=0) || item.dimensions.height>(room.height ?? 3)) return false;
    if(entry.type==='curtain_blind'){
      if(!windowFurnitureInsideRoom(room,item))return false;
    }else if (demoPlacementReason(room,item)||!isFurnitureInsideRoom(room,item.dimensions,item.position,-item.rotationY,resolveFurnitureLocalFootprint(item))) return false;
    if (blockedWindows(room, entry, installationScope?installationScope.filter(other=>other.id!==item.id).map(prepareFurniture):placed).length) return false;
    if (entry.type!=='rug' && swings.some(swing=>obbOverlap(swing,entry.body))) return false;
    if (placementPolicy(item).installation!=='WALL'&&entry.openings.some(zone=>zone.some(point=>!demoFloorContains(room,point))
      ||crossesRoomWall(room,zone)||swings.some(swing=>obbOverlap(swing,zone)))) return false;
    for(const other of placed) {
      if(entry.type==='rug'||other.type==='rug') continue;
      const a=installations.get(item.id)!,b=installations.get(other.item.id)!;
      if(a.minY>=b.maxY-1e-6||b.minY>=a.maxY-1e-6)continue;
      const exempt=supported(entry,other)||supported(other,entry)||supportFor(item,[other.item])?.id===other.item.id||supportFor(other.item,[item])?.id===item.id;
      if(!exempt&&obbOverlap(entry.body,other.body)) return false;
      if(entry.openings.some(zone=>obbOverlap(zone,other.body))||other.openings.some(zone=>obbOverlap(zone,entry.body))) return false;
    }
    return true;
  };
}

/** Conservative envelope near the pane, not a fabricated casement swing. */
export function blockedWindows(room: RoomLayout, entry: PreparedFurniture, placed?: readonly PreparedFurniture[]): Opening[] {
  if (['curtain_blind','rug'].includes(entry.type)) return [];
  // The legacy bed renderer's headboard extends above its scan height.
  const height=entry.type==='bed'&&!entry.item.variantId&&entry.item.theme!=='gray'
    ? entry.item.dimensions.height*(entry.item.theme==='wood'?1.55:1.5) : entry.item.dimensions.height;
  let bottom=resolveFurnitureInstallations(room,[...((placed?.map(p=>p.item)??room.furniture).filter(item=>item.id!==entry.item.id)),entry.item]).get(entry.item.id)?.minY??entry.item.mountHeight??0;
  if(['monitor','tv'].includes(entry.type)) {
    const supports=placed??room.furniture.filter(item=>item.id!==entry.item.id).map(prepareFurniture);
    for(const other of supports) if(supported(entry,other)) bottom=Math.max(bottom,other.item.dimensions.height);
  }
  return room.windows.filter(window=>{
    const sill=windowCenterY(window.dimensions.height,room.height??2.4,window.sillHeight)-window.dimensions.height/2;
    if (bottom+height<=sill+.05||bottom>=sill+window.dimensions.height) return false;
    const {along,inward}=doorFrame(room,window),half=window.dimensions.width/2+.06;
    const point=(x:number,z:number)=>({x:window.position.x+along.x*x+inward.x*z,z:window.position.z+along.z*x+inward.z*z});
    return obbOverlap(entry.body,[point(-half,0),point(half,0),point(half,.6),point(-half,.6)]);
  });
}

export function doorFrame(room: RoomLayout, door: Opening) {
  const wall=room.walls.find(wall=>wall.id===door.wallId) ?? room.walls.reduce<RoomLayout['walls'][number]|undefined>((best,wall)=>{
    const distance=(segment: RoomLayout['walls'][number])=>pointSegmentDistance(door.position,segment.start,segment.end);
    return !best||distance(wall)<distance(best)?wall:best;
  },undefined);
  let dx=wall ? wall.end.x-wall.start.x : Math.cos(door.rotationY);
  let dz=wall ? wall.end.z-wall.start.z : -Math.sin(door.rotationY);
  const length=Math.hypot(dx,dz)||1; dx/=length; dz/=length;
  let inward={x:-dz,z:dx};
  if(!demoFloorContains(room,{x:door.position.x+inward.x*.4,z:door.position.z+inward.z*.4})) inward={x:-inward.x,z:-inward.z};
  return {along:{x:dx,z:dz},inward};
}
function pointSegmentDistance(p: Vector2D,a: Vector2D,b: Vector2D) {
  const dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}
function segmentDistance(a:Vector2D,b:Vector2D,c:Vector2D,d:Vector2D) {
  const cross=(p:Vector2D,q:Vector2D,r:Vector2D)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
  if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return 0;
  return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
}
function distanceToBody(point: Vector2D,item: Furniture) {
  const dx=point.x-item.position.x,dz=point.z-item.position.z,c=Math.cos(item.rotationY),s=Math.sin(item.rotationY);
  const x=dx*c-dz*s,z=dx*s+dz*c,local=resolveFurnitureLocalFootprint(item);
  return Math.hypot(Math.max(local.minX-x,0,x-local.maxX),Math.max(local.minZ-z,0,z-local.maxZ));
}
function accessPoints(entry: PreparedFurniture, offset: number): Vector2D[] {
  const local=resolveFurnitureLocalFootprint(entry.item),c=Math.cos(entry.item.rotationY),s=Math.sin(entry.item.rotationY);
  const transform=(x:number,z:number)=>({x:entry.item.position.x+x*c+z*s,z:entry.item.position.z-x*s+z*c});
  const points=[-.3,0,.3].map(fraction=>transform((local.minX+local.maxX)/2+fraction*(local.maxX-local.minX),local.maxZ+offset));
  if(['bed','sofa_bed','desk_chair'].includes(entry.type)) {
    for(const side of [local.minX-offset,local.maxX+offset]) points.push(transform(side,(local.minZ+local.maxZ)/2));
    if(entry.type==='desk_chair') points.push(transform((local.minX+local.maxX)/2,local.minZ-offset));
  }
  return points;
}

export interface CirculationGrid {
  step: number; radius: number; cols: number; rows: number;
  points: Vector2D[]; floor: Uint8Array;
}
/** Reuse wall/floor erosion across all proposals for the same room. */
export function createCirculationGrid(room: RoomLayout): CirculationGrid {
  const step=Math.max(.15,room.width/100,room.depth/100),radius=MIN_PASSAGE_WIDTH/2+step/Math.SQRT2;
  const cols=Math.ceil(room.width/step),rows=Math.ceil(room.depth/step),floor=new Uint8Array(cols*rows);
  const directions=Array.from({length:8},(_,i)=>({x:Math.cos(i*Math.PI/4)*radius,z:Math.sin(i*Math.PI/4)*radius}));
  const points=Array.from({length:floor.length},(_,id)=>({x:-room.width/2+(id%cols+.5)*step,z:-room.depth/2+(Math.floor(id/cols)+.5)*step}));
  for(let id=0;id<floor.length;id++) {
    const p=points[id];
    if(demoFloorContains(room,p)&&directions.every(d=>demoFloorContains(room,{x:p.x+d.x,z:p.z+d.z}))
      &&room.walls.every(wall=>pointSegmentDistance(p,wall.start,wall.end)>=radius)) floor[id]=1;
  }
  return {step,radius,cols,rows,points,floor};
}
/** Conservative person-radius grid, flood-filled from the entrance. */
export function validateCirculation(room: RoomLayout, grid?: CirculationGrid): LayoutValidation {
  const warnings: string[]=[],reasons: string[]=[];
  if(!Number.isFinite(room.width)||!Number.isFinite(room.depth)||room.width<=0||room.depth<=0) return {valid:false,reasons:['방 치수가 올바르지 않습니다.'],warnings,freeArea:0,reachableCount:0};
  const {step,radius,cols,rows,points,floor}=grid??createCirculationGrid(room);
  const entries=room.furniture.filter(item=>item.status!=='deleted').map(prepareFurniture);
  const physical=entries.filter(entry=>placementPolicy(entry.item).installation!=='SUPPORT'&&!(placementPolicy(entry.item).installation==='WALL'&&(placementPolicy(entry.item).mountBottom??0)>=1.9)&&entry.type!=='rug'&&entry.type!=='curtain_blind'&&!entries.some(other=>supported(entry,other)&&['monitor','tv'].includes(entry.type)));
  const free=new Uint8Array(floor.length), visited=new Uint8Array(free.length);
  const point=(id:number)=>points[id];
  let freeCount=0;
  for(let id=0;id<free.length;id++) if(floor[id]&&!physical.some(entry=>distanceToBody(points[id],entry.item)<radius)) {
    free[id]=1;freeCount++;
  }
  const flood=(start:number,marks:Uint8Array)=>{
    const queue=[start];marks[start]=1;
    for(let head=0;head<queue.length;head++) {
      const id=queue[head],x=id%cols,z=Math.floor(id/cols);
      for(const next of [x>0?id-1:-1,x<cols-1?id+1:-1,z>0?id-cols:-1,z<rows-1?id+cols:-1]) {
        if(next>=0&&free[next]&&!marks[next]) {marks[next]=1;queue.push(next);}
      }
    }
    return queue;
  };
  const doorStarts=room.doors.map(door=>{
    if(door.dimensions.width<MIN_PASSAGE_WIDTH) return -1;
    const {along,inward}=doorFrame(room,door);
    let best=-1,bestDistance=Infinity;
    for(let id=0;id<free.length;id++) if(free[id]) {
      const p=point(id),dx=p.x-door.position.x,dz=p.z-door.position.z;
      const depth=dx*inward.x+dz*inward.z,lateral=Math.abs(dx*along.x+dz*along.z);
      if(depth<MIN_PASSAGE_WIDTH/2||depth>.8||lateral>Math.max(step/2,door.dimensions.width/2-MIN_PASSAGE_WIDTH/2)) continue;
      if(depth+lateral<bestDistance) {best=id;bestDistance=depth+lateral;}
    }
    // A scanned doorway can fall between grid columns. Connect its exact centre
    // to the grid with a swept 60 cm corridor instead of widening the doorway.
    if(best<0) {
      const personRadius=MIN_PASSAGE_WIDTH/2;
      const start={x:door.position.x+inward.x*personRadius,z:door.position.z+inward.z*personRadius};
      if(!demoFloorContains(room,start))return -1;
      for(let id=0;id<free.length;id++)if(free[id]) {
        const p=point(id),dx=p.x-door.position.x,dz=p.z-door.position.z;
        const depth=dx*inward.x+dz*inward.z,lateral=Math.abs(dx*along.x+dz*along.z);
        if(depth<personRadius||depth>.8||lateral>door.dimensions.width/2||depth+lateral>=bestDistance)continue;
        if(room.walls.some(wall=>segmentDistance(start,p,wall.start,wall.end)<personRadius-1e-6)
          ||physical.some(entry=>distanceToBody(start,entry.item)<personRadius-1e-6
            ||entry.body.some((corner,i)=>segmentDistance(start,p,corner,entry.body[(i+1)%entry.body.length])<personRadius-1e-6)))continue;
        best=id;bestDistance=depth+lateral;
      }
    }
    return best;
  });
  if(doorStarts.length) {
    if(doorStarts.some(id=>id<0)) reasons.push('출입문 앞에 60 cm 통로를 확보하지 못했습니다.');
    if(doorStarts[0]>=0) flood(doorStarts[0],visited);
    if(doorStarts.some(id=>id>=0&&!visited[id])) reasons.push('출입문 사이의 이동 통로가 연결되지 않습니다.');
  } else {
    warnings.push('문 정보가 없어 출입문 연결·개폐는 확인하지 못했습니다.');
    const seen=new Uint8Array(free.length);let largest:number[]=[];
    for(let id=0;id<free.length;id++) if(free[id]&&!seen[id]) {const component=flood(id,seen);if(component.length>largest.length) largest=component;}
    largest.forEach(id=>visited[id]=1);
  }
  const reachable=(p:Vector2D)=>{
    const x=Math.floor((p.x+room.width/2)/step),z=Math.floor((p.z+room.depth/2)/step);
    return x>=0&&x<cols&&z>=0&&z<rows&&visited[z*cols+x]===1;
  };
  let reachableCount=0;
  for(const entry of physical) {
    let targets=accessPoints(entry,radius+step);
    if(entry.type==='desk') {
      const chairs=physical.filter(other=>other.type==='desk_chair'&&supported(other,entry));
      targets=targets.concat(chairs.flatMap(chair=>accessPoints(chair,radius+step)));
    }
    if(targets.some(reachable)) reachableCount++;
    else reasons.push(`${entry.item.name}: 사용 위치까지 통로가 연결되지 않습니다.`);
  }
  if(!freeCount) reasons.push('60 cm 통로를 확보할 수 있는 공간이 없습니다.');
  return {valid:reasons.length===0,reasons,warnings,freeArea:freeCount*step*step,reachableCount};
}
export function validateRecommendationLayout(room: RoomLayout, grid?: CirculationGrid): LayoutValidation {
  const check=createPlacementCheck(room,room.furniture),placed:PreparedFurniture[]=[],reasons:string[]=[];
  const installations=resolveFurnitureInstallations(room,room.furniture);
  for(const item of room.furniture.filter(item=>item.status!=='deleted')) {
    const installation=installations.get(item.id);if(!installation?.valid)reasons.push(`${item.name}: ${installation?.reason??'설치 조건을 확인해 주세요.'}`);
    const entry=prepareFurniture(item);
    for (const window of blockedWindows(room,entry)) reasons.push(`${item.name}: ${window.label} 앞의 채광 공간을 가립니다.`);
    if(!check(entry,placed)) reasons.push(`${item.name}: 본체 충돌·경계·문 또는 수납 개폐 공간을 확인해 주세요.`);
    placed.push(entry);
  }
  const highlights=demoOverlapHighlights(room);
  if(highlights.doors.size) reasons.push('문이 열리는 공간을 가구가 막고 있습니다.');
  const circulation=validateCirculation(room,grid);
  const warnings=[...circulation.warnings];
  if(room.windows.some(window=>window.sillHeight==null)) warnings.push('창턱 높이가 없는 창은 화면의 추정 높이를 사용했습니다. 창문 개폐 방식은 미확인입니다.');
  if(room.doors.some(door=>demoDoorSwing(room,door).length<3)) warnings.push('문과 벽의 연결 정보가 부족해 일부 문 개폐 영역을 확인하지 못했습니다.');
  if([...highlights.status.values()].includes('warning')) warnings.push('일부 권장 접근 공간은 주의가 필요합니다.');
  return {...circulation,valid:reasons.length===0&&circulation.valid,reasons:[...reasons,...circulation.reasons],warnings};
}
