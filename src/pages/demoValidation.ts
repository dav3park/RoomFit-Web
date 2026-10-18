import {demoOverlapHighlights} from './demoPlacement';
import type {RoomLayout} from '../types';

export type DemoValidationKind='collision'|'boundary'|'opening'|'access';
export interface DemoValidationItem {
  key:string;
  kind:DemoValidationKind;
  severity:'ERROR'|'WARNING';
  furniture:{id:string;label:string}[];
  messages:string[];
}
export interface DemoValidationReport {
  items:DemoValidationItem[];
  errors:number;
  warnings:number;
}
const pairKey=(a:string,b:string)=>JSON.stringify([a,b].sort());
const sides={front:'전면',left:'왼쪽',right:'오른쪽'};
const order={collision:0,boundary:1,opening:2,access:3};

/** Reports the exact findings used by the 3D overlays, without per-furniture duplicate symptoms. */
export function buildDemoValidationReport(room:RoomLayout,state=demoOverlapHighlights(room)):DemoValidationReport {
  const active=room.furniture.filter(item=>item.status!=='deleted');
  const labels=new Map(active.map(item=>{
    const same=active.filter(other=>other.name===item.name);
    return [item.id,same.length>1?`${item.name} (${same.findIndex(other=>other.id===item.id)+1})`:item.name];
  }));
  const collisionPairs=new Set(state.findings.filter(item=>item.type==='BODY_COLLISION'&&item.otherFurnitureId).map(item=>pairKey(item.furnitureId,item.otherFurnitureId!)));
  const outside=new Set(state.findings.filter(item=>item.type==='OUT_OF_BOUNDS').map(item=>item.furnitureId));
  const grouped=new Map<string,DemoValidationItem>();
  for(const finding of state.findings){
    const owner=labels.get(finding.furnitureId),other=finding.otherFurnitureId?labels.get(finding.otherFurnitureId):undefined;
    if(!owner)continue;
    if(finding.type==='ZONE_INTRUSION'&&((outside.has(finding.furnitureId)&&!finding.otherFurnitureId)||finding.otherFurnitureId&&collisionPairs.has(pairKey(finding.furnitureId,finding.otherFurnitureId))))continue;
    const ids=active.filter(item=>item.id===finding.furnitureId||item.id===finding.otherFurnitureId).map(item=>item.id);
    let key:string,kind:DemoValidationKind,message:string;
    if(finding.type==='BODY_COLLISION'){
      key=`pair:${pairKey(finding.furnitureId,finding.otherFurnitureId!)}`;kind='collision';
      message='두 가구의 본체가 겹칩니다. 서로 떨어지도록 위치를 조정해 주세요.';
    }else if(finding.type==='INSTALLATION_INVALID'){
      key=`installation:${finding.furnitureId}`;kind='boundary';message=finding.message;
    }else if(finding.type==='OUT_OF_BOUNDS'){
      key=`boundary:${finding.furnitureId}`;kind='boundary';message='가구 본체가 방 범위를 벗어났습니다. 방 안쪽으로 옮겨 주세요.';
    }else if(finding.type==='DOOR_CLEARANCE'){
      key=`door:${finding.doorId}:${finding.furnitureId}`;kind='opening';
      const index=room.doors.findIndex(door=>door.id===finding.doorId),door=room.doors[index];
      message=`${door?.label||`문 ${index+1}`}의 개폐 공간이 ${owner}에 가려져 있습니다. (안쪽 90° 열림 가정)`;
    }else{
      key=finding.otherFurnitureId?`pair:${pairKey(finding.furnitureId,finding.otherFurnitureId)}`:`zone-boundary:${finding.furnitureId}`;
      kind=finding.opening?'opening':'access';
      const zone=`${owner} ${sides[finding.zoneSide??'front']} ${finding.opening?'개폐':'접근'} 공간`;
      message=finding.boundary?`${zone}이 방 경계를 벗어납니다.`:`${zone}이 ${other??'다른 가구'}에 가려져 있습니다.`;
      if(finding.opening)message+=' (개폐 방식 근사치)';
    }
    const previous=grouped.get(key);
    if(previous){
      if(order[kind]<order[previous.kind])previous.kind=kind;
      if(finding.severity==='ERROR')previous.severity='ERROR';
      if(!previous.messages.includes(message))previous.messages.push(message);
    }else grouped.set(key,{key,kind,severity:finding.severity,furniture:ids.map(id=>({id,label:labels.get(id)!})),messages:[message]});
  }
  const items=[...grouped.values()].sort((a,b)=>order[a.kind]-order[b.kind]);
  return {items,errors:items.filter(item=>item.severity==='ERROR').length,warnings:items.filter(item=>item.severity==='WARNING').length};
}
