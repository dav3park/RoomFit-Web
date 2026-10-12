import { describe, expect, it } from 'vitest';
import { resolveFurnitureLocalFootprint } from '../components/room/furnitureBoundary';
import fixture from './layoutRegression.fixture.json';
import type { Furniture, RoomLayout } from '../types';
import { generateRecommendations, type RecommendationOptions } from './engine';
import { blockedWindows, createPlacementCheck, prepareFurniture, validateRecommendationLayout } from './layoutValidation';
import { designScore, functionalPlacement, layoutDistance, relatedPoses, nearestWall, worldPosition } from './designGuidelines';

const room=fixture as RoomLayout;
const options:RecommendationOptions={purpose:'업무 / 공부',style:'minimal',palette:'ivory',mode:'rearrange',keepTypes:false,keepSizes:false};
function furniture(id:string,x:number,z:number,height:number):Furniture {
  return {id,name:id,category:'cabinet',sourceType:'bookshelf',dimensions:{width:1,depth:.4,height},position:{x,z},rotationY:0,color:'#fff',material:'wood',status:'existing',removable:true};
}
describe('recommendation redesign regressions',()=>{
  it('keeps all five models and sizes, protects the window and offers real spatial alternatives',()=>{
    const original=structuredClone(room),result=generateRecommendations(room,options);
    expect(result.proposals).toHaveLength(3);expect(room).toEqual(original);
    for(const proposal of result.proposals) {
      expect(proposal.changedFurniture).toBe(0);expect(proposal.movedFurniture).toBeGreaterThan(0);
      expect(validateRecommendationLayout(proposal.room).valid).toBe(true);
      for(const item of proposal.room.furniture) {
        const old=original.furniture.find(old=>old.id===item.id)!;
        expect({...item,position:old.position,rotationY:old.rotationY}).toEqual(old);
        expect(blockedWindows(proposal.room,prepareFurniture(item))).toHaveLength(0);
        if(item.sourceType==='bed') expect(nearestWall(proposal.room,worldPosition(item,0,resolveFurnitureLocalFootprint(item).minZ))!.distance).toBeLessThan(.4);
      }
    }
    for(let i=0;i<3;i++) for(let j=i+1;j<3;j++) expect(layoutDistance(result.proposals[i].room,result.proposals[j].room)).toBeGreaterThanOrEqual(.16);
  },15000);
  it('restyles at the original poses and permits validated real product sizes',()=>{
    const result=generateRecommendations(room,{...options,mode:'preserve'});
    expect(result.proposals.length).toBeGreaterThan(0);
    expect(result.proposals.some(p=>p.changedFurniture>0)).toBe(true);
    expect(result.proposals.some(p=>p.room.furniture.some(item=>JSON.stringify(item.dimensions)!==JSON.stringify(room.furniture.find(old=>old.id===item.id)!.dimensions)))).toBe(true);
    for(const p of result.proposals) for(const item of p.room.furniture) {
      const old=room.furniture.find(old=>old.id===item.id)!;
      expect(item.position).toEqual(old.position);expect(item.rotationY).toEqual(old.rotationY);
      expect(prepareFurniture(item).type).toBe(prepareFurniture(old).type);
    }
  },15000);
  it('ignores model changes, tiny nudges and decoration moves when comparing layouts',()=>{
    const copy=structuredClone(room);copy.furniture.forEach(item=>{item.productId='different';item.position.x+=.1;});
    expect(layoutDistance(room,copy)).toBe(0);
    copy.furniture[0].position.x+=2;expect(layoutDistance(room,copy)).toBeGreaterThan(0);
  });
  it('uses sill height and actual wall direction to distinguish low furniture from window blockers',()=>{
    const tall=furniture('tall',-1.8,-2.35,1.8),low={...tall,dimensions:{...tall.dimensions,height:.5}};
    expect(blockedWindows(room,prepareFurniture(tall))).toHaveLength(1);
    expect(blockedWindows(room,prepareFurniture(low))).toHaveLength(0);
    const screen={...low,sourceType:'monitor',dimensions:{...low.dimensions,height:.4}};
    const desk={...low,id:'support',category:'desk' as const,sourceType:'desk',dimensions:{...low.dimensions,height:.72}};
    expect(blockedWindows(room,prepareFurniture(screen),[prepareFurniture(desk)])).toHaveLength(1);
    const angle=Math.PI/6,rotate=(point:{x:number;z:number})=>({x:point.x*Math.cos(angle)+point.z*Math.sin(angle),z:-point.x*Math.sin(angle)+point.z*Math.cos(angle)});
    const angled={...room,width:8,depth:8,walls:room.walls.map(wall=>({...wall,start:rotate(wall.start),end:rotate(wall.end)})),windows:room.windows.map(window=>({...window,position:rotate(window.position),rotationY:angle}))};
    expect(blockedWindows(angled,prepareFurniture({...tall,position:rotate(tall.position),rotationY:angle}))).toHaveLength(1);
    const unknown={...room,windows:room.windows.map(window=>({...window,sillHeight:undefined}))};
    expect(validateRecommendationLayout({...unknown,furniture:[]}).warnings.join()).toContain('창턱 높이');
  });
  it('rejects a chair facing away from its desk and prefers a usable paired pose',()=>{
    const desk=room.furniture.find(item=>item.sourceType==='desk')!,chair=room.furniture.find(item=>item.sourceType==='chair')!;
    const paired=relatedPoses(chair,[desk])[0];
    expect(functionalPlacement(paired,[desk])).toBe(true);
    expect(functionalPlacement({...paired,rotationY:desk.rotationY},[desk])).toBe(false);
  });
  it('penalizes a one-wall cluster relative to a balanced distribution',()=>{
    const left=[furniture('a',-2.2,-1,1.6),furniture('b',-2.2,1,1.6)];
    const balanced=[left[0],{...left[1],position:{x:2.2,z:1}}];
    expect(designScore(balanced,room,2)).toBeGreaterThan(designScore(left,room,2));
  });
  it('does not disguise an impossible fixed layout as a restyle or three duplicates',()=>{
    const blocked={...room,furniture:[{...furniture('fixed',-1.8,-2.35,1.8),recommendationLocked:true}]};
    const result=generateRecommendations(blocked,{...options,mode:'preserve'});
    expect(result.proposals).toHaveLength(0);expect(blocked.furniture[0].position.x).toBe(-1.8);
    expect(createPlacementCheck(room)(prepareFurniture(blocked.furniture[0]),[])).toBe(false);
  });
});
