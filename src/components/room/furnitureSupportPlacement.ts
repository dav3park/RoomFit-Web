import type { Furniture,RoomLayout } from '../../types';
import type { Vector3Tuple } from '../furniture/variants/types';
import { resolveFurnitureInstallations } from '../../geometry/furnitureInstallation';
export function resolveFurnitureSupportPositions(items:readonly Furniture[]):Map<string,Vector3Tuple> {
 const room:RoomLayout={id:'support-height',name:'',width:100,depth:100,height:100,walls:[],doors:[],windows:[],furniture:[]};
 return new Map([...resolveFurnitureInstallations(room,items)].map(([id,p])=>[id,p.position]));
}
