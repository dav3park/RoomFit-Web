import { placementPolicy } from '../config/furniturePlacementPolicy';
import { supportFor } from '../geometry/furnitureInstallation';
import { worldPosition } from './designGuidelines';
import type { Furniture,RoomLayout } from '../types';
export function rolePlacementCandidates(_room:RoomLayout,item:Furniture,placed:readonly Furniture[]):Furniture[] {
 const policy=placementPolicy(item),result:Furniture[]=[];
 if(policy.installation==='SUPPORT') {
  for(const support of placed.filter(other=>policy.supportTypes?.includes(other.sourceType??'')).slice(0,4)) {
   const surface=placementPolicy(support).surface,source=placementPolicy(support).sourceDimensions??support.dimensions;
   const sx=support.dimensions.width/source.width,sz=support.dimensions.depth/source.depth;
   const x=surface?(surface.minX+surface.maxX)/2*sx:0,z=surface?(surface.minZ+surface.maxZ)/2*sz:0;
   const offsets=surface?[[0,0],[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]]:[[0,0]];
   for(const [dx,dz] of offsets){const p=worldPosition(support,x+dx*(surface?(surface.maxX-surface.minX)*sx:0),z+dz*(surface?(surface.maxZ-surface.minZ)*sz:0));
    const candidate={...item,position:p,rotationY:support.rotationY};if(supportFor(candidate,placed))result.push(candidate);
   }
  }return result.slice(0,24);
 }
 const sleeping=placed.filter(other=>['bed','sofa_bed'].includes(other.sourceType??'')),seating=placed.filter(other=>other.sourceType==='sofa');
 if(policy.roles.includes('divider')){
  const work=placed.filter(other=>['desk','sofa'].includes(other.sourceType??''));let pairs=0;
  for(const a of sleeping)for(const b of work){if(pairs++>=4)break;
   const dx=b.position.x-a.position.x,dz=b.position.z-a.position.z,r=Math.atan2(-dx,-dz);
   const length=Math.hypot(dx,dz)||1;
   for(const t of [.45,.55])for(const shift of [0,-.45,.45])result.push({...item,position:{x:a.position.x+dx*t-dz/length*shift,z:a.position.z+dz*t+dx/length*shift},rotationY:r});
  }
 }
 if(policy.roles.includes('coffee'))for(const host of seating.slice(0,3))result.push({...item,position:worldPosition(host,0,host.dimensions.depth/2+item.dimensions.depth/2+.35),rotationY:host.rotationY});
 if(policy.roles.includes('bedside'))for(const host of [...sleeping,...seating].slice(0,3))for(const side of [-1,1])result.push({...item,position:worldPosition(host,side*(host.dimensions.width/2+item.dimensions.width/2+.12),0),rotationY:host.rotationY});
 if(policy.roles.includes('rug'))for(const host of [...seating,...sleeping].slice(0,4))result.push({...item,position:worldPosition(host,0,host.sourceType==='sofa'?.65:0),rotationY:host.rotationY});
 return result.slice(0,24);
}
export function rolePlacementScore(room:RoomLayout,item:Furniture,placed:readonly Furniture[]):number {
 const candidates=rolePlacementCandidates(room,item,placed),roles=placementPolicy(item).roles;
 if(!candidates.length)return 0;
 const nearest=Math.min(...candidates.map(p=>Math.hypot(p.position.x-item.position.x,p.position.z-item.position.z)
  +(roles.includes('divider')?Math.abs(Math.sin(p.rotationY-item.rotationY))*1.5:0)));
 return Math.max(-15,(roles.includes('divider')?28:15)-nearest*16);
}
