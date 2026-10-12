import catalog from '../data/furniture/catalog.json';
import type { Furniture, RoomLayout } from '../types';
import { PREFERRED_COLOR_TONE_OPTIONS, type PreferredColorToneId } from '../config/preferredColorTone';
import { withAppliedPreferredColorTone, withAppliedColorScheme } from '../config/appliedColorTone';
import { getFurnitureSelectionBlockReason } from '../config/furnitureSelectionPolicy';
import { MAX_ACTIVE_FURNITURE } from '../config/furnitureAdditionPolicy';
import { calculateRotatedFootprint, resolveFurnitureLocalFootprint } from '../components/room/furnitureBoundary';
import { designScore, designFeatures, functionalPlacement, layoutDistance, nearestWall, relatedPoses, wallPoses, worldPosition, floorCentroid, localPosition } from './designGuidelines';
import { demoFloorContains } from '../pages/demoPlacement';
import { createPlacementCheck, furnitureType, prepareFurniture, validateRecommendationLayout, validateCirculation, createCirculationGrid, type CirculationGrid, type LayoutValidation, type PreparedFurniture } from './layoutValidation';

import { rankAutomaticColorSchemes } from '../config/automaticColorSchemes';

export type RecommendationPalette = PreferredColorToneId | 'auto';
export type RecommendationMode = 'preserve' | 'rearrange' | 'new';
export type RecommendationPurpose = '휴식' | '업무 / 공부' | '취미 / 여가' | '수납';
export type RecommendationStyle = 'minimal' | 'natural' | 'modern' | 'classic' | 'midcentury';
export interface RecommendationOptions {
  purpose: RecommendationPurpose;
  style: RecommendationStyle;
  palette: RecommendationPalette;
  mode: RecommendationMode;
  keepTypes: boolean;
  keepSizes: boolean;
}
export interface RecommendationProposal {
  id: string;
  title: string;
  room: RoomLayout;
  score: number;
  features: string[];
  validation: LayoutValidation;
  matchedStyle: number;
  changedFurniture: number;
  movedFurniture: number;
}
export interface RecommendationResult { proposals: RecommendationProposal[]; messages: string[] }
type Product = (typeof catalog.products)[number];
interface Slot { id: string; type: string; original?: Furniture; required: boolean }
interface PartialLayout { items: PreparedFurniture[]; score: number; tagScore: number; warnings: string[] }
const lifestyle = {'휴식':'REST','업무 / 공부':'WORK_STUDY','취미 / 여가':'HOBBY_LEISURE','수납':'STORAGE'} as const;
const strategies = [
  {title:'이동 공간 중심',tag:3},
  {title:'생활 영역 분리',tag:4},
  {title:'균형 있는 구성',tag:3},
];
const supportType:Record<string,string>={monitor:'desk',tv:'media_console'};
const placementOrder=['bed','sofa_bed','sofa','desk','wardrobe','bookshelf'];
const priority=(type:string)=> {const index=placementOrder.indexOf(type);return index<0?20:index;};

function category(type:string): Furniture['category'] {
  return ['bed','sofa_bed'].includes(type)?'bed':['desk','multi_table','side_table'].includes(type)?'desk':
    ['sofa','desk_chair'].includes(type)?'chair':type==='rug'?'rug':type==='mood_lamp'?'lighting':'cabinet';
}
function productFurniture(product:Product,id:string):Furniture {
  return {id,name:product.label,category:category(product.furnitureType),sourceType:product.furnitureType,
    productId:product.productId,variantId:product.variantId,styleTags:[...product.styleTags],dimensions:{...product.dimensions},
    position:{x:0,z:0},rotationY:0,color:'#c7b299',material:'wood',status:'recommended',removable:true};
}
function tagScore(product:Product,options:RecommendationOptions) {
  const preferredMaterial=(options.palette==='auto'&&['natural','classic','midcentury'].includes(options.style))||['brown','beige'].includes(options.palette)?/wood|oak|walnut|rattan/i:
    ['black','gray'].includes(options.palette)?/metal|black|gray/i:/fabric|white|paint/i;
  return (product.styleTags.includes(options.style)?3:0)+(product.lifestyleTags.includes(lifestyle[options.purpose])?2:0)
    +(product.materials.some(material=>preferredMaterial.test(material))?.5:0);
}
function sameSize(product:Product,item:Furniture) {
  return (['width','depth','height'] as const).every(axis=>Math.abs(product.dimensions[axis]-item.dimensions[axis])<.001);
}
function candidates(slot:Slot,options:RecommendationOptions,attempt:number) {
  if(options.mode==='rearrange'&&slot.original) return [{item:structuredClone(slot.original),score:0,warning:''}];
  if(slot.type==='curtain_blind'&&slot.original) return [{item:structuredClone(slot.original),score:0,warning:`${slot.original.name}: 창에 설치된 가구는 기존 설치 위치와 상품을 유지합니다.`}];
  const products=catalog.products.filter(product=>product.furnitureType===slot.type
    && (!options.keepSizes||!slot.original||sameSize(product,slot.original))
    && !product.variantId.includes('tabletop'));
  products.sort((a,b)=>tagScore(b,options)-tagScore(a,options)
    || a.dimensions.width*a.dimensions.depth-b.dimensions.width*b.dimensions.depth || a.productId.localeCompare(b.productId));
  // Include several sizes rather than getting stuck on one large, high-scoring model.
  const selected=[...products.slice(0,4),...products.slice().sort((a,b)=>a.dimensions.width*a.dimensions.depth-b.dimensions.width*b.dimensions.depth).slice(0,2)];
  const unique=[...new Map(selected.map(product=>[product.productId,product])).values()];
  if(unique.length>1&&options.mode==='preserve') { const shift=attempt%unique.length; unique.push(...unique.splice(0,shift)); }
  const result=unique.map(product=>({item:productFurniture(product,slot.id),score:tagScore(product,options),warning:product.styleTags.includes(options.style)?'':`${product.label}: 선택한 스타일과 완전히 일치하지 않습니다.`}));
  if(slot.original) result.push({item:structuredClone(slot.original),score:(slot.original.styleTags?.includes(options.style)?3:0),warning:options.mode==='preserve'?`${slot.original.name}: 위치·크기 조건에 맞는 대체 상품 대신 기존 가구를 유지했습니다.`:!products.length?`${slot.original.name}: 같은 크기의 대체 상품이 없어 기존 가구를 유지합니다.`:''});
  return result;
}
function makeSlots(room:RoomLayout,options:RecommendationOptions):Slot[] {
  const active=room.furniture.filter(item=>item.status!=='deleted');
  if(options.mode!=='new'||options.keepTypes) return active.filter(item=>!item.recommendationLocked).map(item=>({id:item.id,type:furnitureType(item),original:item,required:true}));
  const sleeping=active.some(item=>['bed','sofa_bed'].includes(furnitureType(item)))||/원룸|studio/i.test(room.name+' '+(room.description??''));
  const types=options.purpose==='업무 / 공부'?['desk','desk_chair']:options.purpose==='취미 / 여가'?['sofa','multi_table']:
    options.purpose==='수납'?['wardrobe','drawer_chest']:[sleeping?'bed':'sofa','wardrobe'];
  if(sleeping&&!types.includes('bed')) types.unshift('bed');
  const optional=options.purpose==='업무 / 공부'?['bookshelf','wardrobe']:options.purpose==='취미 / 여가'?['bookshelf','plant']:
    options.purpose==='수납'?['bookshelf','hanger']:['nightstand','plant'];
  const lockedTypes=active.filter(item=>item.recommendationLocked).map(furnitureType);
  return [...types.map(type=>({type,required:true})),...optional.map(type=>({type,required:false}))]
    .filter(slot=>!lockedTypes.includes(slot.type)).map((slot,index)=>({...slot,id:`recommend-${room.id}-${index}-${slot.type}`}));
}
function positionScore(item:Furniture,placed:readonly PreparedFurniture[],room:RoomLayout,attempt:number) {
  const type=furnitureType(item),center=floorCentroid(room),local=resolveFurnitureLocalFootprint(item);
  const back=worldPosition(item,0,local.minZ),wall=nearestWall(room,back);
  let score=-(wall?.distance??0)*(['bed','sofa_bed'].includes(type)?14:6);
  if(['bed','sofa_bed','sofa'].includes(type)&&wall) score+=wall.wall.id===room.walls[attempt%room.walls.length]?.id?18:0;
  const front=worldPosition(item,0,local.maxZ+.5);
  if(!demoFloorContains(room,front)) score-=20;
  let mass=item.dimensions.width*item.dimensions.depth;
  let x=(item.position.x-center.x)*mass,z=(item.position.z-center.z)*mass;
  for(const other of placed) if(!['rug','curtain_blind','monitor','tv'].includes(other.type)) {
    const weight=other.item.dimensions.width*other.item.dimensions.depth;
    mass+=weight;x+=(other.item.position.x-center.x)*weight;z+=(other.item.position.z-center.z)*weight;
  }
  score-=Math.max(0,Math.hypot(x/mass,z/mass)-.5)*5;
  if(type==='desk'&&room.windows.length) {
    const window=room.windows.slice().sort((a,b)=>Math.hypot(a.position.x-item.position.x,a.position.z-item.position.z)-Math.hypot(b.position.x-item.position.x,b.position.z-item.position.z))[0];
    const p=localPosition(item,window.position),distance=Math.hypot(p.x,p.z);
    score+=Math.abs(p.x)/(distance||1)*8-Math.abs(distance-1.5)*2;
    for(const bed of placed.filter(entry=>['bed','sofa_bed'].includes(entry.type))) score+=Math.min(3,Math.hypot(bed.item.position.x-item.position.x,bed.item.position.z-item.position.z))*2;
  }
  const related=relatedPoses(item,placed.map(entry=>entry.item));
  if(related.length) score-=Math.min(...related.map(pose=>Math.hypot(pose.position.x-item.position.x,pose.position.z-item.position.z)))*8;
  if(['bed','sofa_bed'].includes(type)) for(const door of room.doors) score-=Math.max(0,2-Math.hypot(door.position.x-item.position.x,door.position.z-item.position.z))*4;
  return score;
}
function poses(item:Furniture,placed:readonly PreparedFurniture[],room:RoomLayout,attempt:number) {
  if(furnitureType(item)==='curtain_blind') return [item];
  const supporters=placed.filter(entry=>entry.type===supportType[item.sourceType??'']);
  if(supporters.length) return supporters.map(entry=>({...item,position:{...entry.item.position},rotationY:entry.item.rotationY}));
  const result:Furniture[]=[...relatedPoses(item,placed.map(entry=>entry.item)),...wallPoses(item,room)];
  if(furnitureType(item)==='desk_chair'&&placed.some(entry=>entry.type==='desk')) return result.filter(pose=>functionalPlacement(pose,placed.map(entry=>entry.item)));
  for(let r=0;r<4;r++) {
    const rotationY=(r+attempt%4)%4*Math.PI/2;
    const footprint=calculateRotatedFootprint(item.dimensions,-rotationY,resolveFurnitureLocalFootprint(item));
    const minX=-room.width/2+.12-footprint.minX,maxX=room.width/2-.12-footprint.maxX;
    const minZ=-room.depth/2+.12-footprint.minZ,maxZ=room.depth/2-.12-footprint.maxZ;
    if(minX>maxX||minZ>maxZ) continue;
    const xs=[minX,maxX,...Array.from({length:Math.min(8,Math.ceil((maxX-minX)/.6))},(_,i)=>minX+(i+1)*(maxX-minX)/(Math.min(8,Math.ceil((maxX-minX)/.6))+1))];
    const zs=[minZ,maxZ,...Array.from({length:Math.min(8,Math.ceil((maxZ-minZ)/.6))},(_,i)=>minZ+(i+1)*(maxZ-minZ)/(Math.min(8,Math.ceil((maxZ-minZ)/.6))+1))];
    for(const x of xs) for(const z of zs) {
      if(x!==minX&&x!==maxX&&z!==minZ&&z!==maxZ&&Math.abs(x)>room.width/3&&Math.abs(z)>room.depth/3) continue;
      result.push({...item,position:{x,z},rotationY});
    }
  }
  return result;
}
function signature(room:RoomLayout) {
  return room.furniture.map(item=>`${item.id}:${item.productId}:${item.position.x.toFixed(2)},${item.position.z.toFixed(2)}:${item.rotationY.toFixed(2)}`).sort().join('|');
}
function solve(room:RoomLayout,slots:Slot[],locked:Furniture[],options:RecommendationOptions,attempt:number,strategy:number,grid:CirculationGrid):PartialLayout[] {
  const check=createPlacementCheck(room);
  let beam:PartialLayout[]=[{items:locked.map(prepareFurniture),score:0,tagScore:0,warnings:[]}];
  const ordered=slots.slice().sort((a,b)=>Number(a.type in supportType)-Number(b.type in supportType)
    || Number(a.type==='desk_chair')-Number(b.type==='desk_chair')||Number(b.required)-Number(a.required)
    || priority(a.type)-priority(b.type));
  for(const slot of ordered) {
    const expanded:PartialLayout[]=[];
    for(const partial of beam) {
      for(const candidate of candidates(slot,options,attempt)) {
        if(candidate.item.dimensions.height>(room.height??3)) continue;
        if(getFurnitureSelectionBlockReason(candidate.item.variantId==='bed-loft-desk'?'bed-loft-desk':slot.type,[],{...room,furniture:partial.items.map(entry=>entry.item)})) continue;
        const choices=options.mode==='preserve'&&slot.original?[{...candidate.item,position:{...slot.original.position},rotationY:slot.original.rotationY}]:poses(candidate.item,partial.items,room,attempt);
        const scored=choices.map(item=>({item,score:positionScore(item,partial.items,room,attempt)})).sort((a,b)=>b.score-a.score);
        let accepted=0;const poseGroups=new Set<string>();
        for(const {item} of scored) {
          const entry=prepareFurniture(item);
          if(!check(entry,partial.items)||!functionalPlacement(item,partial.items.map(entry=>entry.item))) continue;
          const poseGroup=`${nearestWall(room,item.position)?.wall.id}:${Math.round(item.rotationY/(Math.PI/2))}:${Math.floor(item.position.x/1.2)},${Math.floor(item.position.z/1.2)}`;
          if(options.mode!=='preserve'&&poseGroups.has(poseGroup)) continue;
          if(!validateCirculation({...room,furniture:[...partial.items.map(other=>other.item),item]},grid).valid) continue;
          const items=[...partial.items,entry],tagScore=partial.tagScore+candidate.score*strategies[strategy].tag;
          poseGroups.add(poseGroup);
          expanded.push({items,tagScore,score:tagScore+designScore(items.map(entry=>entry.item),room,strategy),warnings:[...partial.warnings,...(candidate.warning?[candidate.warning]:[])]});
          if(++accepted>=4) break;
        }
      }
      if(!slot.required) expanded.push({...partial,score:partial.score-8,warnings:[...partial.warnings,`${({bookshelf:'책장',wardrobe:'옷장',nightstand:'협탁',plant:'화분',hanger:'행거'} as Record<string,string>)[slot.type]??slot.type}: 공간·통로 확보를 위해 추가하지 않았습니다.`]});
    }
    const unique=new Map<string,PartialLayout>();
    for(const partial of expanded.sort((a,b)=>b.score-a.score)) {
      const key=partial.items.map(entry=>`${entry.item.productId}:${entry.item.position.x.toFixed(2)},${entry.item.position.z.toFixed(2)}:${entry.item.rotationY}`).join('|');
      if(!unique.has(key)) unique.set(key,partial);
      if(unique.size>=8) break;
    }
    beam=[...unique.values()];
    if(!beam.length) break;
  }
  return beam;
}
export function generateRecommendations(input:RoomLayout,requested:RecommendationOptions):RecommendationResult {
  const room=structuredClone(input);
  const options={...requested,keepTypes:requested.mode!=='new'||requested.keepTypes,keepSizes:requested.mode==='rearrange'||requested.keepSizes};
  if((options.palette!=='auto'&&!PREFERRED_COLOR_TONE_OPTIONS.some(tone=>tone.id===options.palette))||!Object.keys(lifestyle).includes(options.purpose)||!['minimal','natural','modern','classic','midcentury'].includes(options.style)
    || !['preserve','rearrange','new'].includes(options.mode)||!Number.isFinite(room.width)||!Number.isFinite(room.depth)||room.width<=0||room.depth<=0
    || room.width>50||room.depth>50) return {proposals:[],messages:['방 치수 또는 추천 조건을 확인해 주세요. 최대 50 m 공간까지 지원합니다.']};
  const active=room.furniture.filter(item=>item.status!=='deleted');
  if(active.some(item=>![item.position.x,item.position.z,item.rotationY,...Object.values(item.dimensions)].every(Number.isFinite))) return {proposals:[],messages:['가구 위치와 크기를 확인해 주세요.']};
  if(active.length>MAX_ACTIVE_FURNITURE) return {proposals:[],messages:[`가구는 최대 ${MAX_ACTIVE_FURNITURE}개까지 추천할 수 있습니다.`]};
  const grid=createCirculationGrid(room);
  const locked=active.filter(item=>item.recommendationLocked);
  const slots=makeSlots(room,options);
  if(!slots.length&&!locked.length) return {proposals:[],messages:['유지할 가구가 없습니다. 새로운 디자인을 선택해 주세요.']};
  const proposals:RecommendationProposal[]=[],pool:RecommendationProposal[]=[],failures=new Set<string>();
  for(let strategy=0;strategy<strategies.length;strategy++) {
    const valid:RecommendationProposal[]=[],seen=new Set<string>();
    for(let attempt=0;attempt<(options.mode==='preserve'?1:2);attempt++) {
      const solved=solve(room,slots,locked,options,strategy*2+attempt,strategy,grid);
      for(const partial of solved) {
        const next=withAppliedPreferredColorTone({...room,furniture:partial.items.map(entry=>entry.item)},options.palette);
        const key=signature(next);if(seen.has(key)) continue;seen.add(key);
        if(next.furniture.length>MAX_ACTIVE_FURNITURE) continue;
        const validation=validateRecommendationLayout(next,grid);
        if(!validation.valid) {validation.reasons.forEach(reason=>failures.add(reason));continue;}
        validation.warnings=[...new Set([...validation.warnings,...partial.warnings])];
        const matchedStyle=next.furniture.filter(item=>item.styleTags?.includes(options.style)).length;
        const changedFurniture=next.furniture.filter(item=>room.furniture.find(old=>old.id===item.id)?.productId!==item.productId).length;
        const movedFurniture=next.furniture.filter(item=>{const old=room.furniture.find(old=>old.id===item.id);return old&&(Math.hypot(old.position.x-item.position.x,old.position.z-item.position.z)>.01||Math.abs(old.rotationY-item.rotationY)>.01);}).length;
        valid.push({id:`proposal-${strategy}-${attempt}-${valid.length}`,title:strategies[strategy].title,room:next,
          score:Math.round(partial.tagScore/strategies[strategy].tag*3+designScore(next.furniture,room,2)+validation.freeArea*2),features:[`${next.furniture.length}개 가구`,options.mode==='rearrange'?`${movedFurniture}개 이동 · 기존 모델·크기 유지`:options.mode==='preserve'?`${changedFurniture}개 상품 교체 · 위치·방향 유지`:`${movedFurniture}개 이동 · ${changedFurniture}개 교체/추가`,...designFeatures(next)],validation,matchedStyle,changedFurniture,movedFurniture});
      }
    }
    pool.push(...valid);
  }
  // Quality first, then penalize similarity (MMR-inspired); no forced third option.
  const ranked=pool.sort((a,b)=>b.score-a.score);
  while(proposals.length<3) {
    const choices=ranked.filter(proposal=>proposals.every(old=>options.mode==='preserve'?signature(old.room)!==signature(proposal.room):layoutDistance(old.room,proposal.room)>=.16));
    choices.sort((a,b)=> {
      const diversity=(proposal:RecommendationProposal)=>proposals.length&&options.mode!=='preserve'?Math.min(...proposals.map(old=>layoutDistance(old.room,proposal.room)))*20:0;
      return b.score+diversity(b)-a.score-diversity(a);
    });
    if(!choices.length) break;
    const chosen=choices[0];ranked.splice(ranked.indexOf(chosen),1);
    proposals.push({...chosen,title:options.mode==='preserve'?`취향에 맞춘 상품 구성 ${proposals.length+1}`:`배치 ${proposals.length+1} · ${chosen.title}`});
  }
  if(options.palette==='auto'&&proposals.length) {
    const schemes=rankAutomaticColorSchemes(room,options.style,options.purpose);
    // Fixed-pose mode can legitimately compare colour-only alternatives;
    // moving modes still require different spatial structures.
    if(options.mode==='preserve') while(proposals.length<3) proposals.push({...proposals[0],id:`colour-${proposals.length}`});
    proposals.forEach((proposal,index)=>{
      const scheme=schemes[index];
      proposal.room=withAppliedColorScheme(proposal.room,scheme.id);
      proposal.features=[...proposal.features,`색 조합: ${scheme.label}`];
      if(options.mode==='preserve') proposal.title=`색 조합 ${index+1} · ${scheme.label}`;
    });
  }
  const messages=proposals.length===0?['조건을 만족하는 배치를 찾지 못했습니다. 가구 고정·크기 유지 조건을 줄이거나 새로운 디자인을 선택해 주세요.',...[...failures].slice(0,3)]:
    proposals.length<3?[`현재 조건에서 서로 다른 추천안 ${proposals.length}개를 찾았습니다. 조건을 임의로 해제하지 않았습니다.`]:[];
  return {proposals,messages};
}
