import { useCallback,useEffect,useSyncExternalStore } from 'react';
import type { FurnitureVariantRegistry } from './FurnitureVariantRegistry';
import { getLoadedFurnitureVariant,getProductionFurnitureVariantState,loadProductionFurnitureVariant,retryProductionFurnitureVariant,subscribeFurnitureModels } from './productionFurnitureCatalog';
export function useFurnitureVariant(id:string,registry:FurnitureVariantRegistry) {
 const snapshot=useCallback(()=>registry.hasFurnitureVariant(id)?'ready':getProductionFurnitureVariantState(id),[id,registry]);
 const state=useSyncExternalStore(subscribeFurnitureModels,snapshot,snapshot);
 useEffect(()=>{if(state==='idle')void loadProductionFurnitureVariant(id).catch(()=>{});},[id,state]);
 const variant=registry.hasFurnitureVariant(id)?registry.getFurnitureVariant(id):getLoadedFurnitureVariant(id);
 return {variant,error:state==='error',retry:()=>retryProductionFurnitureVariant(id)};
}
