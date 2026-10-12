import { normalizeCanonicalFurnitureType } from './canonicalFurnitureType';
import type { ThemePalette } from './furnitureBehaviorPolicy';
import type { RoomLayout } from '../types';

// Muted furniture finishes inspired by the supplied swatches. Harmony families
// and dominant/support/accent roles follow the references in docs, not a promise
// that projected screen area or the whole room measures exactly 60/30/10.
export const AUTOMATIC_COLOR_SCHEMES = [
  {id:'linen-blue',label:'아이보리 · 샌드 · 블루',harmony:'차분한 보색',styles:['minimal','natural','modern'],purposes:['업무 / 공부','휴식'],floor:'warm',
    palette:{primary:['#F4EFE5','#E7DDCE'],secondary:['#A5BBC8','#879EAD'],accent:['#B3875C','#6D7062'],neutral:['#F8F5EE','#DDD5C8'],wood:['#AD845E','#76543B'],emissive:['#FFE4AE']}},
  {id:'sage-cream',label:'세이지 · 크림 · 우드',harmony:'자연색 조화',styles:['natural','minimal'],purposes:['휴식','수납'],floor:'warm',
    palette:{primary:['#F1EDDF','#DDDACC'],secondary:['#849A82','#657B67'],accent:['#B57B61','#855C4C'],neutral:['#F8F5EC','#DBD9C9'],wood:['#AA8057','#725538'],emissive:['#FFE2AA']}},
  {id:'blush-navy',label:'네이비 · 더스티 핑크',harmony:'명도 대비',styles:['classic','modern'],purposes:['휴식','업무 / 공부'],floor:'cool',
    palette:{primary:['#F1E3E2','#DDD1D2'],secondary:['#3E557A','#6E85A0'],accent:['#C8919C','#AA7884'],neutral:['#F7F1EC','#D6CED0'],wood:['#907059','#5C4438'],emissive:['#FFE1B1']}},
  {id:'teal-sand',label:'딥 틸 · 샌드 · 오커',harmony:'보색 포인트',styles:['modern','classic','midcentury'],purposes:['업무 / 공부','취미 / 여가'],floor:'warm',
    palette:{primary:['#EDE7D3','#DAD0B2'],secondary:['#3D7273','#527E81'],accent:['#C8AE61','#A58B48'],neutral:['#F6F3E9','#D4D6CF'],wood:['#986D46','#644A35'],emissive:['#FFE2AA']}},
  {id:'mint-peach',label:'민트 · 피치 · 아이보리',harmony:'부드러운 보색',styles:['natural','minimal','midcentury'],purposes:['휴식','취미 / 여가'],floor:'cool',
    palette:{primary:['#F2F0E7','#DEE6D7'],secondary:['#93B9A1','#73A18C'],accent:['#D4A097','#B8847D'],neutral:['#FAF6EF','#E3DED1'],wood:['#B99470','#866446'],emissive:['#FFE4B6']}},
  {id:'olive-ochre',label:'올리브 · 오커 · 인디고',harmony:'분할 보색 포인트',styles:['midcentury','natural','classic'],purposes:['취미 / 여가','수납'],floor:'warm',
    palette:{primary:['#EDE8DA','#D8D1C2'],secondary:['#7D865A','#667348'],accent:['#CCA44F','#44506B'],neutral:['#F4F0E6','#D7D4C6'],wood:['#9B724C','#64482F'],emissive:['#FFE0A5']}},
] as const satisfies readonly {id:string;label:string;harmony:string;styles:readonly string[];purposes:readonly string[];floor:string;palette:ThemePalette}[];

export type AutomaticColorSchemeId = (typeof AUTOMATIC_COLOR_SCHEMES)[number]['id'];
export function getAutomaticColorScheme(value: unknown) {
  return AUTOMATIC_COLOR_SCHEMES.find(scheme=>scheme.id===value)??null;
}
export function rankAutomaticColorSchemes(room: RoomLayout, style: string, purpose: string) {
  const hex=room.floor?.material.color??'#c2996a';
  const warm=/^#[\da-f]{6}$/i.test(hex)&&parseInt(hex.slice(1,3),16)-parseInt(hex.slice(5,7),16)>20;
  const score=(scheme:(typeof AUTOMATIC_COLOR_SCHEMES)[number])=>Number((scheme.styles as readonly string[]).includes(style))*5
    +Number((scheme.purposes as readonly string[]).includes(purpose))*2+(scheme.floor===(warm?'warm':'cool')?1:0);
  return [...AUTOMATIC_COLOR_SCHEMES].sort((a,b)=>score(b)-score(a));
}
/** Large storage stays quiet; upholstery carries the supporting hue; small
 * accessories use accents. Glass, metal hardware and foliage remain protected. */
export function automaticFurniturePalette(id: AutomaticColorSchemeId, type=''): ThemePalette {
  const base=getAutomaticColorScheme(id)!.palette;
  type=normalizeCanonicalFurnitureType(type)??type.toLowerCase();
  if(/^(bed|sofa|sofa_bed|chair|desk_chair|rug)$/.test(type)) {
    return {...base,primary:base.secondary,secondary:base.accent,accent:[base.secondary[1],base.accent[1]]};
  }
  if(/^(plant|mood_lamp|lighting|nightstand|side_table)$/.test(type)) {
    return {...base,primary:base.accent,secondary:base.secondary};
  }
  return base;
}
