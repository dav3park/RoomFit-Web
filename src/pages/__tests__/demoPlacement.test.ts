import { describe, expect, it } from 'vitest';
import { OrthographicCamera, Vector3 } from 'three';
import { projectDemoFloor, demoDoorSwing, demoDoorZone, demoFloorContains, demoPlacementReason, demoPlacementIssues, demoOverlapHighlights } from '../demoPlacement';
import { addDemoProduct, resizeDemoFurniture, DEMO_PRODUCTS, DEMO_ROOMS, copyDemoRoom } from '../workspaceDemoState';
import { resolveFurnitureLocalFootprint } from '../../components/room/furnitureBoundary';
import { localClearanceRects } from '../../geometry/clearance';

describe('demo placement', () => {
  it('highlights both colliding bodies, but not blue zones overlapping each other', () => {
    const room=copyDemoRoom(DEMO_ROOMS[0]);
    const a={...room.furniture[0],id:'a',variantId:null,rotationY:0,position:{x:0,z:0},dimensions:{width:1,depth:1,height:1}};
    const b={...a,id:'b'};
    room.furniture=[a,b];
    expect([...demoOverlapHighlights(room).bodies]).toEqual(['a','b']);
    const side=localClearanceRects(a).find(zone=>zone.side==='left')!;
    room.furniture=[a,{...b,position:{x:1+(side.maxX-side.minX)*1.5,z:0}}];
    const clear=demoOverlapHighlights(room);
    expect(clear.bodies.size).toBe(0);expect(clear.clearance.size).toBe(0);
    room.furniture=[a,{...b,status:'deleted'}];
    expect(demoOverlapHighlights(room).bodies.size).toBe(0);
  });
  it('colors an obstructed furniture clearance and restores blue after moving away', () => {
    const room=copyDemoRoom(DEMO_ROOMS[0]);
    const a={...room.furniture[0],id:'a',variantId:null,rotationY:0,position:{x:0,z:0},dimensions:{width:1,depth:1,height:1}};
    const front=localClearanceRects(a).find(zone=>zone.side==='front')!;
    const b={...a,id:'b',dimensions:{width:.1,depth:.1,height:.5},position:{x:0,z:front.minZ+.1}};
    room.furniture=[a,b];
    expect(demoOverlapHighlights(room).clearance.get('a')?.has('front')).toBe(true);
    room.furniture=[a,{...b,position:{x:2,z:0}}];
    expect(demoOverlapHighlights(room).clearance.has('a')).toBe(false);
  });
  it('colors the assumed door swing only for physical furniture intrusion, including rotated bodies', () => {
    const room=copyDemoRoom(DEMO_ROOMS[0]);
    const door=room.doors[0],swing=demoDoorSwing(room,door),hinge=swing[0],a=swing[1],b=swing.at(-1)!;
    const item={...room.furniture[0],variantId:null,rotationY:Math.PI/4,dimensions:{width:.2,depth:.2,height:.5},position:{x:hinge.x+.3*(a.x+b.x-2*hinge.x),z:hinge.z+.3*(a.z+b.z-2*hinge.z)}};
    room.furniture=[item];
    expect(demoOverlapHighlights(room).doors.has(door.id)).toBe(true);
    expect(demoOverlapHighlights(room).status.get(item.id)).toBe('blocked');
    room.furniture=[{...item,status:'deleted'}];
    expect(demoOverlapHighlights(room).doors.size).toBe(0);
    room.furniture=[{...item,sourceType:'rug'}];
    expect(demoOverlapHighlights(room).doors.size).toBe(0);
    room.furniture=[{...item,position:{x:0,z:0}}];
    expect(demoOverlapHighlights(room).doors.has(door.id)).toBe(false);
  });
  it('applies blue/orange/red rules to every catalog type without blue-blue collision rules', () => {
    const room=copyDemoRoom(DEMO_ROOMS[0]);room.doors=[];
    for (const type of new Set(DEMO_PRODUCTS.map(p=>p.furnitureType))) {
      const product=DEMO_PRODUCTS.find(p=>p.furnitureType===type)!;
      const owner={...addDemoProduct(room,product).furniture.at(-1)!,variantId:null,rotationY:0,
        position:{x:0,z:0},dimensions:{width:.5,depth:.5,height:.5}};
      room.furniture=[owner];
      expect(demoOverlapHighlights(room).status.get(owner.id),type).toBe('clear');
      const front=localClearanceRects(owner).find(z=>z.side==='front');
      if (!front || type === 'rug') continue;
      const blocker={...owner,id:'blocker',sourceType:'plant',category:'cabinet' as const,
        dimensions:{width:.05,depth:.05,height:.5},position:{x:0,z:front.minZ+.03}};
      room.furniture=[owner,blocker];
      const expected=['wardrobe','drawer_chest'].includes(type) ? 'blocked' : 'warning';
      const result=demoOverlapHighlights(room);
      expect(result.zoneStatus.get(owner.id)?.get('front'),type).toBe(expected);
      expect(result.status.get(owner.id),type).toBe(expected);
      room.furniture=[owner,{...blocker,position:{x:0,z:0}}];
      expect(demoOverlapHighlights(room).status.get(owner.id),type).toBe('blocked');
    }
  });
  it('keeps opening checks aligned with the visible furniture after rotation', () => {
    const room=copyDemoRoom(DEMO_ROOMS[0]);room.doors=[];
    const item={...room.furniture[0],id:'owner',variantId:null,sourceType:'wardrobe',rotationY:Math.PI/2,
      position:{x:0,z:0},dimensions:{width:.5,depth:.5,height:.5}};
    const blocker={...item,id:'blocker',sourceType:'plant',rotationY:0,
      dimensions:{width:.05,depth:.05,height:.5},position:{x:.3,z:0}};
    room.furniture=[item,blocker];
    expect(demoOverlapHighlights(room).zoneStatus.get('owner')?.get('front')).toBe('blocked');
    room.furniture=[item,{...blocker,position:{x:0,z:.3}}];
    expect(demoOverlapHighlights(room).zoneStatus.get('owner')?.has('front')).not.toBe(true);
  });
  it('preserves desk-chair exemptions and escalates clearance outside a wall', () => {
    const room=copyDemoRoom(DEMO_ROOMS[0]);room.doors=[];
    const item={...room.furniture[0],variantId:null,sourceType:'desk',rotationY:0,
      position:{x:0,z:0},dimensions:{width:.5,depth:.5,height:.5}};
    room.furniture=[item,{...item,id:'chair',sourceType:'desk_chair'}];
    expect(demoOverlapHighlights(room).status.get(item.id)).toBe('clear');
    room.furniture=[{...item,sourceType:'wardrobe',position:{x:0,z:room.depth/2-.4}}];
    expect(demoOverlapHighlights(room).status.get(item.id)).toBe('blocked');
    room.furniture=[{...item,position:{x:0,z:room.depth/2-.4}}];
    expect(demoOverlapHighlights(room).status.get(item.id)).toBe('warning');
  });
  it('projects onto world y=-1 using the current camera and rejects outside canvas', () => {
    const camera = new OrthographicCamera(-5, 5, 5, -5, .1, 100);
    camera.position.set(0, 9, 0); camera.up.set(0, 0, -1); camera.lookAt(0, -1, 0); camera.updateMatrixWorld();
    const rect = {left: 100, top: 100, width: 1000, height: 1000};
    const world = new Vector3(2, -1, -3).project(camera);
    const hit = projectDemoFloor(camera, rect, 100 + (world.x + 1) * 500, 100 + (1 - world.y) * 500)!;
    expect(hit.x).toBeCloseTo(2); expect(hit.z).toBeCloseTo(-3);
    expect(projectDemoFloor(camera, rect, 99, 200)).toBeNull();
    camera.position.set(5, 8, 5); camera.up.set(0, 1, 0); camera.lookAt(0, -1, 0); camera.updateMatrixWorld();
    const oblique = new Vector3(1, -1, 1).project(camera);
    const rotated = projectDemoFloor(camera, rect, 100 + (oblique.x + 1) * 500, 100 + (1 - oblique.y) * 500)!;
    expect(rotated.x).toBeCloseTo(1); expect(rotated.z).toBeCloseTo(1);
  });
  it('allows body collisions with warnings, rejects outside positions and nonfinite input; does not mutate the room', () => {
    const room = copyDemoRoom(DEMO_ROOMS[0]);
    const product = DEMO_PRODUCTS.find(item => item.furnitureType === 'bed')!;
    const item = addDemoProduct(room, product).furniture.at(-1)!;
    expect(demoPlacementReason(room, item)).toBeNull();
    room.furniture=room.furniture.map((furniture,index)=>index===0 ? {...furniture,position:{x:0,z:0}} : furniture);
    const overlapping={...item, position: {x:0,z:0}};
    expect(demoPlacementReason(room,overlapping)).toBeNull();
    expect(demoPlacementIssues(room,overlapping).some(issue=>issue.type==='BODY_COLLISION')).toBe(true);
    expect(demoPlacementReason(room, {...item, position: {x:100,z:0}})).not.toBeNull();
    expect(demoPlacementReason(room, {...item, position: {x:NaN,z:0}})).not.toBeNull();
    expect(room.furniture).toHaveLength(DEMO_ROOMS[0].furniture.length);
  });
  it('excludes a missing floor in an L shaped room and links door space to the actual wall', () => {
    const room = copyDemoRoom(DEMO_ROOMS[0]);
    const points = [{x:-2,z:-2},{x:2,z:-2},{x:2,z:0},{x:0,z:0},{x:0,z:2},{x:-2,z:2}];
    room.walls = points.map((start,i) => ({id:`wall-${i}`,start,end:points[(i+1)%points.length]}));
    expect(demoFloorContains(room,{x:1,z:1})).toBe(false);
    expect(demoFloorContains(room,{x:-1,z:1})).toBe(true);
    const door = {...room.doors[0], wallId:'wall-0',position:{x:0,z:-2},dimensions:{width:1,depth:.1,height:2}};
    const corners = demoDoorZone(room,door);
    expect(corners).toHaveLength(4); expect(corners[2].z).toBeCloseTo(-1.2);
    expect(corners[0].x).toBeCloseTo(-.6);
    expect(demoDoorZone(room,{...door,wallId:'unknown'})).toEqual([]);
  });
  it('renders an illustrative quarter circle using door width, also for legacy wall-less doors', () => {
    const room = copyDemoRoom(DEMO_ROOMS[0]);
    const door = room.doors[0];
    const points = demoDoorSwing(room,{...door,wallId:undefined});
    expect(points).toHaveLength(34);
    for (const p of points.slice(1)) expect(Math.hypot(p.x-points[0].x,p.z-points[0].z)).toBeCloseTo(door.dimensions.width);
    const a=points[1], b=points.at(-1)!;
    expect((a.x-points[0].x)*(b.x-points[0].x)+(a.z-points[0].z)*(b.z-points[0].z)).toBeCloseTo(0);
    expect(demoDoorSwing({...room,walls:[]},door)).toEqual([]);
  });
  it('rejects a footprint whose edges span a concave notch', () => {
    const room = copyDemoRoom(DEMO_ROOMS[0]); room.furniture = [];
    const points = [{x:-3,z:-3},{x:3,z:-3},{x:3,z:3},{x:1,z:3},{x:1,z:0},{x:-1,z:0},{x:-1,z:3},{x:-3,z:3}];
    room.width=6;room.depth=6;
    room.walls=points.map((start,i)=>({id:`wall-${i}`,start,end:points[(i+1)%points.length]}));
    const product=DEMO_PRODUCTS.find(item=>item.furnitureType==='rug')!;
    const item=addDemoProduct(room,product).furniture.at(-1)!;
    item.variantId=null;item.position={x:0,z:-1};item.dimensions={width:5,depth:4,height:.01};
    expect(demoPlacementReason(room,item)).toContain('방 바닥');
  });
  it('resizes an added variant and its collision/clearance footprints together, preserving the source', () => {
    const room=copyDemoRoom(DEMO_ROOMS[0]);
    const product=DEMO_PRODUCTS.find(p=>p.furnitureType==='wardrobe')!;
    const item=addDemoProduct(room,product).furniture.at(-1)!;
    const before=resolveFurnitureLocalFootprint(item);
    const resized=resizeDemoFurniture(room,item,product.dimensions,'width',.05);
    const ratio=resized.dimensions.width/item.dimensions.width;
    expect(resized.demoVisualScale).toEqual([ratio,1,1]);
    const after=resolveFurnitureLocalFootprint(resized);
    expect(after.minX).toBeCloseTo(before.minX*ratio);expect(after.maxX).toBeCloseTo(before.maxX*ratio);
    expect(localClearanceRects(resized).find(z=>z.side==='front')!.maxX).toBeCloseTo(after.maxX);
    expect(item.dimensions).toEqual(product.dimensions);expect(item.demoVisualScale).toBeUndefined();
    expect(resizeDemoFurniture(room,item,product.dimensions,'depth',100).dimensions.depth).toBeCloseTo(product.dimensions.depth*1.15);
    expect(resizeDemoFurniture(room,item,product.dimensions,'depth',-100).dimensions.depth).toBeCloseTo(product.dimensions.depth*.85);
  });
  it('keeps the backend wardrobe and drawer clearance approximations', () => {
    const room = DEMO_ROOMS[0];
    for (const type of ['wardrobe','drawer_chest']) {
      const product = DEMO_PRODUCTS.find(item => item.furnitureType === type)!;
      const item = addDemoProduct(room,product).furniture.at(-1)!;
      const front = localClearanceRects(item).find(zone => zone.side === 'front')!;
      expect(front.minZ).toBeGreaterThanOrEqual(0);
      expect(front.maxZ-front.minZ).toBeCloseTo(type === 'wardrobe' ? item.dimensions.width/2 : product.requiredClearance.front);
    }
  });
});
