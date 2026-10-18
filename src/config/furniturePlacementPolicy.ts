import metadata from '../data/furniture/placementMetadata.json';
import { normalizeCanonicalFurnitureType } from './canonicalFurnitureType';
import type { Furniture, Size3D } from '../types';
export type InstallationMode='FLOOR'|'WINDOW'|'WALL'|'SUPPORT'|'FLOOR_CEILING'|'FLOOR_OVERLAY';
export interface FurniturePlacementPolicy {
 canonicalType?:string;
 installation:InstallationMode;
 roles:string[];
 supportTypes?:string[];
 surface?:{height:number;minX:number;maxX:number;minZ:number;maxZ:number};
 mountBottom?:number;
 windowTreatment?:'CURTAIN'|'BLIND';
 sourceDimensions?:Size3D;
}
const defaults:Record<string,FurniturePlacementPolicy>=metadata.defaults as Record<string,FurniturePlacementPolicy>;
const overrides:Record<string,Partial<FurniturePlacementPolicy>>=metadata.overrides as Record<string,Partial<FurniturePlacementPolicy>>;
const policies=new Map<string,FurniturePlacementPolicy>();
export function getFurniturePlacementPolicy(variantId?:string|null,canonicalType?:string):FurniturePlacementPolicy {
 const key=`${variantId??''}:${canonicalType??''}`,cached=policies.get(key);if(cached)return cached;
 const type=normalizeCanonicalFurnitureType((variantId?overrides[variantId]?.canonicalType:undefined)??canonicalType);
 const policy={...(type?defaults[type]:undefined)??{installation:'FLOOR' as const,roles:[]},...(variantId?overrides[variantId]:undefined)};
 policies.set(key,policy);return policy;
}
export function placementPolicy(item:Furniture):FurniturePlacementPolicy {
 // 스캔된 벽걸이(상부장·TV)는 카탈로그 policy 대신 스캔 높이를 쓴다 — 백엔드 FurnitureInstallationPolicy와 동일.
 if(item.mount==='WALL'&&item.elevation!==undefined)return {canonicalType:item.sourceType,installation:'WALL',roles:[],mountBottom:item.elevation};
 return getFurniturePlacementPolicy(item.variantId,item.sourceType??item.category);
}
