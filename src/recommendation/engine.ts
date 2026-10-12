import catalog from '../data/furniture/catalog.json';
import type { Furniture, RoomLayout } from '../types';
import { PREFERRED_COLOR_TONE_OPTIONS, type PreferredColorToneId } from '../config/preferredColorTone';
import { withAppliedPreferredColorTone } from '../config/appliedColorTone';
import { getFurnitureSelectionBlockReason } from '../config/furnitureSelectionPolicy';
import { MAX_ACTIVE_FURNITURE } from '../config/furnitureAdditionPolicy';
import { calculateRotatedFootprint, resolveFurnitureLocalFootprint } from '../components/room/furnitureBoundary';
import { createPlacementCheck, furnitureType, prepareFurniture, validateRecommendationLayout, validateCirculation, type LayoutValidation, type PreparedFurniture } from './layoutValidation';

export type RecommendationMode = 'preserve' | 'rearrange' | 'new';
export type RecommendationPurpose = '휴식' | '업무 / 공부' | '취미 / 여가' | '수납';
export type RecommendationStyle = 'minimal' | 'natural' | 'modern' | 'classic' | 'midcentury';
export interface RecommendationOptions {
  purpose: RecommendationPurpose;
  style: RecommendationStyle;
  palette: PreferredColorToneId;
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
interface PartialLayout { items: PreparedFurniture[]; score: number; warnings: string[] }
const lifestyle = {'휴식':'REST','업무 / 공부':'WORK_STUDY','취미 / 여가':'HOBBY_LEISURE','수납':'STORAGE'} as const;
const strategies = [
  {title:'넓은 이동 공간',wall:7,space:10,tag:3},
  {title:'생활 목적 중심',wall:3,space:3,tag:9},
  {title:'균형 있는 구성',wall:5,space:6,tag:6},
];
const supportType:Record<string,string>={monitor:'desk',tv:'media_console'};

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
  const preferredMaterial=['brown','beige'].includes(options.palette)?/wood|oak|walnut|rattan/i:
    ['black','gray'].includes(options.palette)?/metal|black|gray/i:/fabric|white|paint/i;
  return (product.styleTags.includes(options.style)?3:0)+(product.lifestyleTags.includes(lifestyle[options.purpose])?2:0)
    +(product.materials.some(material=>preferredMaterial.test(material))?.5:0);
}
function sameSize(product:Product,item:Furniture) {
  return (['width','depth','height'] as const).every(axis=>Math.abs(product.dimensions[axis]-item.dimensions[axis])<.001);
}
function candidates(slot:Slot,options:RecommendationOptions,attempt:number) {
  if(slot.type==='curtain_blind'&&slot.original) return [{item:structuredClone(slot.original),score:0,warning:`${slot.original.name}: 창에 설치된 가구는 기존 설치 위치와 상품을 유지합니다.`}];
  const products=catalog.products.filter(product=>product.furnitureType===slot.type
    && (!options.keepSizes||!slot.original||sameSize(product,slot.original))
    && !product.variantId.includes('tabletop'));
  products.sort((a,b)=>tagScore(b,options)-tagScore(a,options)
    || a.dimensions.width*a.dimensions.depth-b.dimensions.width*b.dimensions.depth || a.productId.localeCompare(b.productId));
  // Include several sizes rather than getting stuck on one large, high-scoring model.
  const selected=[...products.slice(0,2),...products.slice().sort((a,b)=>a.dimensions.width*a.dimensions.depth-b.dimensions.width*b.dimensions.depth).slice(0,2)];
  const unique=[...new Map(selected.map(product=>[product.productId,product])).values()];
  if(unique.length>1&&attempt%3===1) unique.reverse();
  const result=unique.map(product=>({item:productFurniture(product,slot.id),score:tagScore(product,options),warning:product.styleTags.includes(options.style)?'':`${product.label}: 선택한 스타일과 완전히 일치하지 않습니다.`}));
  if(slot.original) result.push({item:structuredClone(slot.original),score:(slot.original.styleTags?.includes(options.style)?3:0),warning:!products.length?`${slot.original.name}: 같은 크기의 대체 상품이 없어 기존 가구를 유지합니다.`:''});
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
function positionScore(item:Furniture,placed:readonly PreparedFurniture[],room:RoomLayout,attempt:number,strategy:number) {
  const footprint=calculateRotatedFootprint(item.dimensions,-item.rotationY,resolveFurnitureLocalFootprint(item));
  const wallDistance=Math.min(room.width/2-Math.abs(item.position.x)-footprint.effectiveWidth/2,room.depth/2-Math.abs(item.position.z)-footprint.effectiveDepth/2);
  const preference=strategies[strategy];
  const facing=-item.position.x*Math.sin(item.rotationY)-item.position.z*Math.cos(item.rotationY);
  const side=(attempt%4===0?-item.position.x:attempt%4===1?item.position.z:attempt%4===2?item.position.x:-item.position.z);
  let score=-wallDistance*preference.wall+facing+side*.7;
  if(item.sourceType==='desk'&&room.windows.length) score-=Math.min(...room.windows.map(window=>Math.hypot(item.position.x-window.position.x,item.position.z-window.position.z)))*1.2;
  if(item.sourceType==='desk_chair') {
    const desks=placed.filter(entry=>entry.type==='desk');
    if(desks.length) score-=Math.min(...desks.map(entry=>Math.hypot(item.position.x-entry.item.position.x,item.position.z-entry.item.position.z)))*10;
  }
  // Keep the room's center available for movement instead of filling it first.
  score-=Math.max(0,1.5-Math.hypot(item.position.x,item.position.z))*preference.space;
  return score;
}
function poses(item:Furniture,placed:readonly PreparedFurniture[],room:RoomLayout,attempt:number) {
  if(item.sourceType==='curtain_blind') return [item];
  const supporters=placed.filter(entry=>entry.type===supportType[item.sourceType??'']);
  if(supporters.length) return supporters.map(entry=>({...item,position:{...entry.item.position},rotationY:entry.item.rotationY}));
  const result:Furniture[]=[];
  if(item.sourceType==='desk_chair') for(const desk of placed.filter(entry=>entry.type==='desk')) {
    const local=resolveFurnitureLocalFootprint(desk.item),chair=resolveFurnitureLocalFootprint(item);
    for(const shift of [0,-.2,.2]) {
      const distance=local.maxZ+chair.maxZ+.12,theta=desk.item.rotationY;
      result.push({...item,position:{x:desk.item.position.x+shift*Math.cos(theta)+distance*Math.sin(theta),z:desk.item.position.z-shift*Math.sin(theta)+distance*Math.cos(theta)},rotationY:theta+Math.PI});
    }
  }
  for(let r=0;r<4;r++) {
    const rotationY=(r+attempt%4)%4*Math.PI/2;
    const footprint=calculateRotatedFootprint(item.dimensions,-rotationY,resolveFurnitureLocalFootprint(item));
    const minX=-room.width/2+.12-footprint.minX,maxX=room.width/2-.12-footprint.maxX;
    const minZ=-room.depth/2+.12-footprint.minZ,maxZ=room.depth/2-.12-footprint.maxZ;
    if(minX>maxX||minZ>maxZ) continue;
    const xs=[minX,maxX,...Array.from({length:Math.min(16,Math.ceil((maxX-minX)/.4))},(_,i)=>minX+(i+1)*(maxX-minX)/(Math.min(16,Math.ceil((maxX-minX)/.4))+1))];
    const zs=[minZ,maxZ,...Array.from({length:Math.min(16,Math.ceil((maxZ-minZ)/.4))},(_,i)=>minZ+(i+1)*(maxZ-minZ)/(Math.min(16,Math.ceil((maxZ-minZ)/.4))+1))];
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
function distinct(a:RoomLayout,b:RoomLayout) {
  return a.furniture.length!==b.furniture.length||a.furniture.some(item=>{
    const other=b.furniture.find(other=>other.id===item.id);
    return !other||other.productId!==item.productId||Math.hypot(item.position.x-other.position.x,item.position.z-other.position.z)>.4
      || Math.abs(Math.sin((item.rotationY-other.rotationY)/2))>.5;
  });
}
function solve(room:RoomLayout,slots:Slot[],locked:Furniture[],options:RecommendationOptions,attempt:number,strategy:number):PartialLayout[] {
  const check=createPlacementCheck(room);
  let beam:PartialLayout[]=[{items:locked.map(prepareFurniture),score:0,warnings:[]}];
  const ordered=slots.slice().sort((a,b)=>Number(a.type in supportType)-Number(b.type in supportType)
    || Number(a.type==='desk_chair')-Number(b.type==='desk_chair')||Number(b.required)-Number(a.required)
    || (b.original?.dimensions.width??(b.type==='bed'?2:1))-(a.original?.dimensions.width??(a.type==='bed'?2:1)));
  for(const slot of ordered) {
    const expanded:PartialLayout[]=[];
    for(const partial of beam) {
      for(const candidate of candidates(slot,options,attempt)) {
        if(candidate.item.dimensions.height>(room.height??3)) continue;
        if(getFurnitureSelectionBlockReason(candidate.item.variantId==='bed-loft-desk'?'bed-loft-desk':slot.type,[],{...room,furniture:partial.items.map(entry=>entry.item)})) continue;
        const choices=options.mode==='preserve'&&slot.original?[{...candidate.item,position:{...slot.original.position},rotationY:slot.original.rotationY}]:poses(candidate.item,partial.items,room,attempt);
        choices.sort((a,b)=>positionScore(b,partial.items,room,attempt,strategy)-positionScore(a,partial.items,room,attempt,strategy));
        let accepted=0;
        for(const item of choices) {
          const entry=prepareFurniture(item);
          if(!check(entry,partial.items)) continue;
          if(!validateCirculation({...room,furniture:[...partial.items.map(other=>other.item),item]}).valid) continue;
          expanded.push({items:[...partial.items,entry],score:partial.score+candidate.score*strategies[strategy].tag+positionScore(item,partial.items,room,attempt,strategy),warnings:[...partial.warnings,...(candidate.warning?[candidate.warning]:[])]});
          if(++accepted>=4) break;
        }
      }
      if(!slot.required) expanded.push({...partial,score:partial.score-8,warnings:[...partial.warnings,`${({bookshelf:'책장',wardrobe:'옷장',nightstand:'협탁',plant:'화분',hanger:'행거'} as Record<string,string>)[slot.type]??slot.type}: 공간·통로 확보를 위해 추가하지 않았습니다.`]});
    }
    const unique=new Map<string,PartialLayout>();
    for(const partial of expanded.sort((a,b)=>b.score-a.score)) {
      const key=partial.items.map(entry=>`${entry.item.productId}:${entry.item.position.x.toFixed(2)},${entry.item.position.z.toFixed(2)}:${entry.item.rotationY}`).join('|');
      if(!unique.has(key)) unique.set(key,partial);
      if(unique.size>=6) break;
    }
    beam=[...unique.values()];
    if(!beam.length) break;
  }
  return beam;
}
export function generateRecommendations(input:RoomLayout,requested:RecommendationOptions):RecommendationResult {
  const room=structuredClone(input);
  const options={...requested,keepTypes:requested.mode!=='new'||requested.keepTypes,keepSizes:requested.mode==='preserve'||requested.keepSizes};
  if(!PREFERRED_COLOR_TONE_OPTIONS.some(tone=>tone.id===options.palette)||!Object.keys(lifestyle).includes(options.purpose)||!['minimal','natural','modern','classic','midcentury'].includes(options.style)
    || !['preserve','rearrange','new'].includes(options.mode)||!Number.isFinite(room.width)||!Number.isFinite(room.depth)||room.width<=0||room.depth<=0
    || room.width>50||room.depth>50) return {proposals:[],messages:['방 치수 또는 추천 조건을 확인해 주세요. 최대 50 m 공간까지 지원합니다.']};
  const active=room.furniture.filter(item=>item.status!=='deleted');
  if(active.some(item=>![item.position.x,item.position.z,item.rotationY,...Object.values(item.dimensions)].every(Number.isFinite))) return {proposals:[],messages:['가구 위치와 크기를 확인해 주세요.']};
  if(active.length>MAX_ACTIVE_FURNITURE) return {proposals:[],messages:[`가구는 최대 ${MAX_ACTIVE_FURNITURE}개까지 추천할 수 있습니다.`]};
  const locked=active.filter(item=>item.recommendationLocked);
  const slots=makeSlots(room,options);
  if(!slots.length&&!locked.length) return {proposals:[],messages:['유지할 가구가 없습니다. 새로운 디자인을 선택해 주세요.']};
  const proposals:RecommendationProposal[]=[],failures=new Set<string>();
  for(let strategy=0;strategy<strategies.length;strategy++) {
    const valid:RecommendationProposal[]=[],seen=new Set<string>();
    for(let attempt=0;attempt<3;attempt++) {
      const solved=solve(room,slots,locked,options,strategy*3+attempt,strategy);
      for(const partial of solved) {
        const next=withAppliedPreferredColorTone({...room,furniture:partial.items.map(entry=>entry.item)},options.palette);
        const key=signature(next);if(seen.has(key)) continue;seen.add(key);
        if(next.furniture.length>MAX_ACTIVE_FURNITURE) continue;
        const validation=validateRecommendationLayout(next);
        if(!validation.valid) {validation.reasons.forEach(reason=>failures.add(reason));continue;}
        validation.warnings=[...new Set([...validation.warnings,...partial.warnings])];
        const matchedStyle=next.furniture.filter(item=>item.styleTags?.includes(options.style)).length;
        const changedFurniture=next.furniture.filter(item=>room.furniture.find(old=>old.id===item.id)?.productId!==item.productId).length;
        const movedFurniture=next.furniture.filter(item=>{const old=room.furniture.find(old=>old.id===item.id);return old&&(Math.hypot(old.position.x-item.position.x,old.position.z-item.position.z)>.01||Math.abs(old.rotationY-item.rotationY)>.01);}).length;
        valid.push({id:`proposal-${strategy}-${attempt}-${valid.length}`,title:strategies[strategy].title,room:next,
          score:Math.round(partial.score+validation.freeArea*strategies[strategy].space),features:[`${next.furniture.length}개 가구 · 스타일 일치 ${matchedStyle}개`,options.mode==='preserve'?'위치·방향·크기 유지':`${movedFurniture}개 이동 · ${changedFurniture}개 교체/추가`],validation,matchedStyle,changedFurniture,movedFurniture});
      }
    }
    const chosen=valid.sort((a,b)=>b.score-a.score).find(proposal=>proposals.every(old=>distinct(old.room,proposal.room)));
    if(chosen) proposals.push(chosen);
  }
  const messages=proposals.length===0?['조건을 만족하는 배치를 찾지 못했습니다. 가구 고정·크기 유지 조건을 줄이거나 새로운 디자인을 선택해 주세요.',...[...failures].slice(0,3)]:
    proposals.length<3?[`현재 조건에서 서로 다른 추천안 ${proposals.length}개를 찾았습니다. 조건을 임의로 해제하지 않았습니다.`]:[];
  return {proposals,messages};
}
