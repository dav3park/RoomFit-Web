import { isLoftDeskFurniture } from '../config/furnitureSelectionPolicy';
import { FURNITURE_SELECTION_ITEMS } from '../config/furnitureSelectionCatalog';
import type { ConsultationSelection } from '../api/designConsultation';
import type { RoomLayout } from '../types';
import type { RecommendationOptions } from './engine';
import { isCanonicalFurnitureType } from '../config/canonicalFurnitureType';
import { furnitureType } from './layoutValidation';

export interface PreparedConsultation {
  revision: string;
  conditions: { id: string; effects: {kind:string;value:string;count:number}[]; unresolved: string[] }[];
}
export interface CompiledConsultation {
  options: RecommendationOptions | null;
  reflected: string[];
  omitted: string[];
  blockers: string[];
}
const typeLabel=(type:string)=>FURNITURE_SELECTION_ITEMS.find(item=>item.canonicalType===type)?.name??type;
const values:Record<string,readonly string[]>={PURPOSE:['휴식','업무 / 공부','취미 / 여가','수납'],STYLE:['minimal','natural','modern','classic','midcentury'],PALETTE:['auto','ivory','beige','gray','brown','green','blue','pink','black']};

export function compileConsultation(selections:readonly ConsultationSelection[],plan:PreparedConsultation,room:RoomLayout):CompiledConsultation {
  const fail=()=>{throw new Error('조건을 추천 설정으로 정리하지 못했습니다. 입력은 유지됩니다. 다시 시도해 주세요.');};
  const inputs=selections.flatMap((item,index)=>item.included?[{...item,id:String(index)}]:[]);
  if(!plan||!Array.isArray(plan.conditions)||plan.conditions.length!==inputs.length||!inputs.length) return fail();
  const reflected:string[]=[],omitted:string[]=[],blockers:string[]=[],seen=new Set<string>();
  const tags:Record<string,Set<string>>={PURPOSE:new Set(),STYLE:new Set(),PALETTE:new Set()};
  const counts:Record<string,number>={},excluded=new Set<string>(),keep=new Set<string>();
  let strictStyle=false;
  for(const condition of plan.conditions){
    if(!condition||typeof condition.id!=='string'||seen.has(condition.id))return fail();seen.add(condition.id);
    const input=inputs.find(item=>item.id===condition.id);
    if(!input||!Array.isArray(condition.effects)||condition.effects.length>8||!Array.isArray(condition.unresolved)||condition.unresolved.length>4
      ||(!condition.effects.length&&!condition.unresolved.length)||condition.unresolved.some(text=>typeof text!=='string'||!text.trim()||text.length>300))return fail();
    for(const effect of condition.effects){
      if(!effect||typeof effect.value!=='string'||effect.value.length>128||!Number.isInteger(effect.count)
        ||(effect.kind==='REQUIRE_TYPE'?effect.count<1||effect.count>24:effect.count!==0))return fail();
      if(values[effect.kind]){if(!values[effect.kind].includes(effect.value))return fail();}
      else if(effect.kind==='REQUIRE_TYPE'||effect.kind==='EXCLUDE_TYPE'){if(!isCanonicalFurnitureType(effect.value))return fail();}
      else if(effect.kind==='KEEP_ITEM'){if(!room.furniture.some(item=>item.status!=='deleted'&&item.id===effect.value))return fail();}
      else return fail();
    }
    if(condition.unresolved.length){
      (input.priority==='REQUIRED'?blockers:omitted).push(`${input.description} — ${condition.unresolved.join(' ')}`);
      continue;
    }
    reflected.push(input.description);
    for(const effect of condition.effects){
      if(tags[effect.kind])tags[effect.kind].add(effect.value);
      if(effect.kind==='STYLE'&&input.priority==='REQUIRED')strictStyle=true;
      if(effect.kind==='REQUIRE_TYPE'){
        if(counts[effect.value]!==undefined&&counts[effect.value]!==effect.count)blockers.push(`${typeLabel(effect.value)}: 요청한 가구 개수가 서로 달라요. 한 가지 개수로 정리해 주세요.`);
        counts[effect.value]=effect.count;
      }
      if(effect.kind==='EXCLUDE_TYPE')excluded.add(effect.value);
      if(effect.kind==='KEEP_ITEM')keep.add(effect.value);
    }
  }
  for(const [kind,label] of [['PURPOSE','생활 목적'],['STYLE','스타일'],['PALETTE','색감']])if(tags[kind].size>1)blockers.push(`${label}을 한 가지로 정리해 주세요. 서로 다른 요청을 임의로 선택하지 않았어요.`);
  for(const type of excluded)if(counts[type])blockers.push(`${typeLabel(type)}: 포함과 제외가 함께 선택되어 있어요.`);
  const locked=room.furniture.filter(item=>item.status!=='deleted'&&(item.recommendationLocked||keep.has(item.id)));
  for(const item of locked)if(excluded.has(furnitureType(item))||(excluded.has('desk')&&isLoftDeskFurniture(item)))blockers.push(`${item.name}: 유지·고정 조건과 제외 조건이 충돌해요.`);
  for(const [type,count] of Object.entries(counts))if(locked.filter(item=>furnitureType(item)===type).length>count)blockers.push(`${typeLabel(type)}: 고정된 가구가 요청한 개수보다 많아요.`);
  if(!reflected.length)blockers.push('추천에 반영할 조건을 구체적으로 적어 주세요.');
  const purpose=([...tags.PURPOSE][0]??'휴식') as RecommendationOptions['purpose'];
  const style=([...tags.STYLE][0]??'natural') as RecommendationOptions['style'];
  const palette=([...tags.PALETTE][0]??'auto') as RecommendationOptions['palette'];
  return {reflected,omitted,blockers,options:blockers.length?null:{purpose,style,palette,mode:'new',keepTypes:false,keepSizes:false,
    constraints:{counts,excludedTypes:[...excluded],keepIds:[...keep],strictStyle}}};
}
