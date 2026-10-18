import { getLayoutAppliedPreferredColorTone } from '../config/appliedColorTone';
import catalog from '../data/furniture/catalog.json';
import { FURNITURE_SELECTION_ITEMS } from '../config/furnitureSelectionCatalog';
import { isLoftDeskFurniture } from '../config/furnitureSelectionPolicy';
import { getAutomaticColorScheme } from '../config/automaticColorSchemes';
import { furnitureType } from './layoutValidation';
import type { RecommendationOptions } from './engine';
import type { RoomLayout } from '../types';

export interface ConsultationAudit {
  valid:boolean;
  checks:{label:string;expected:number;actual:number;passed:boolean}[];
  inventory:{name:string;type:string;label:string;count:number}[];
  issues:string[];
}
const label=(type:string)=>FURNITURE_SELECTION_ITEMS.find(item=>item.canonicalType===type)?.name??type;
export function auditConsultationProposal(room:RoomLayout,options:RecommendationOptions,original:RoomLayout):ConsultationAudit {
  const issues:string[]=[],checks:ConsultationAudit['checks']=[],groups=new Map<string,ConsultationAudit['inventory'][number]>();
  let styleMismatch=false;
  const active=room.furniture.filter(item=>item.status!=='deleted');
  const types=active.map(item=>{
    const product=catalog.products.find(product=>product.productId===item.productId);
    const variant=catalog.products.find(product=>product.variantId===item.variantId);
    const actual=product??variant;
    if(actual&&(actual.furnitureType!==furnitureType(item)||(product&&item.variantId&&product.variantId!==item.variantId)))issues.push(`${item.name}: 상품 정보와 실제 가구 종류가 일치하지 않아요.`);
    if(!actual&&!original.furniture.some(old=>old.id===item.id))issues.push(`${item.name}: 카탈로그에서 상품을 확인하지 못했어요.`);
    const styles=actual?.styleTags??original.furniture.find(old=>old.id===item.id)?.styleTags??[];
    if(!styles.includes(options.style))styleMismatch=true;
    const type=actual?.furnitureType??furnitureType(item),name=actual?.label??item.name;
    const key=`${type}:${name}`,group=groups.get(key);
    if(group)group.count++;else groups.set(key,{name,type,label:label(type),count:1});
    return type;
  });
  const constraints=options.constraints;
  if(constraints){
    for(const [type,expected]of Object.entries(constraints.counts)){
      const actual=types.filter(value=>value===type).length;checks.push({label:label(type),expected,actual,passed:actual===expected});
    }
    for(const type of constraints.excludedTypes){
      const actual=types.filter((value,index)=>value===type||(type==='desk'&&isLoftDeskFurniture(active[index]))).length;
      checks.push({label:`${label(type)} 제외`,expected:0,actual,passed:actual===0});
    }
    for(const id of new Set([...constraints.keepIds,...original.furniture.filter(item=>item.status!=='deleted'&&item.recommendationLocked).map(item=>item.id)])){
      const before=original.furniture.find(item=>item.id===id),after=active.find(item=>item.id===id);
      const same=!!before&&!!after&&before.productId===after.productId&&before.variantId===after.variantId&&before.rotationY===after.rotationY
        &&before.position.x===after.position.x&&before.position.z===after.position.z
        &&(['width','depth','height']as const).every(axis=>before.dimensions[axis]===after.dimensions[axis]);
      checks.push({label:`${before?.name??'선택한 가구'} 유지`,expected:1,actual:Number(same),passed:same});
    }
    if(constraints.strictStyle&&styleMismatch)issues.push('필수 인테리어 스타일과 맞지 않는 가구가 있어요.');
  }
  if(options.palette==='auto'?!getAutomaticColorScheme(room.appliedColorSchemeId):getLayoutAppliedPreferredColorTone(room)!==options.palette)issues.push('요청한 색감이 적용되지 않았어요.');
  checks.filter(check=>!check.passed).forEach(check=>issues.push(`${check.label}: 요청 ${check.expected}개, 결과 ${check.actual}개로 일치하지 않아요.`));
  return {valid:issues.length===0,checks,inventory:[...groups.values()],issues};
}
