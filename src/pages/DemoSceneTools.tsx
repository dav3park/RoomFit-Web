import { useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Shape, DoubleSide, Vector3 } from 'three';
import { FurnitureMesh } from '../components/room/FurnitureMesh';
import { FootprintDecal } from '../components/room/FootprintDecal';
import { resolveFurnitureLocalFootprint } from '../components/room/furnitureBoundary';
import { localClearanceRects } from '../geometry/clearance';
import { projectDemoFloor, demoPlacementReason, demoDoorSwing, demoOverlapHighlights, DEMO_SPACE_COLORS, type DemoSpaceStatus } from './demoPlacement';
import type { Furniture, RoomLayout, Vector2D } from '../types';

function FurnitureClearance({item, states}: {item: Furniture; states?: ReadonlyMap<string, DemoSpaceStatus>}) {
  return <group position={[item.position.x, 0, item.position.z]} rotation={[0, item.rotationY, 0]}>{localClearanceRects(item).map(zone => <FootprintDecal key={zone.side} {...zone} y={.02} color={DEMO_SPACE_COLORS[states?.get(zone.side) ?? 'clear']} opacity={.42} />)}</group>;
}

export default function DemoSceneTools({room, pending, selectedId, all, toolbar, onPoint, onDrop}: {room: RoomLayout; pending: Furniture | null; selectedId: string | null; all: boolean; toolbar?: ReactNode; onPoint: (point: Vector2D) => void; onDrop: (point: Vector2D) => void}) {
  const {camera, gl} = useThree();
  useEffect(() => {
    if (!pending) return;
    const canvas = gl.domElement;
    const point = (event: MouseEvent) => projectDemoFloor(camera, canvas.getBoundingClientRect(), event.clientX, event.clientY);
    const over = (event: DragEvent) => { event.preventDefault(); const p = point(event); if (p) onPoint(p); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; };
    const drop = (event: DragEvent) => { event.preventDefault(); const p = point(event); if (p) onDrop(p); };
    let origin = {x: 0, y: 0};
    const down = (event: PointerEvent) => { origin = {x:event.clientX,y:event.clientY}; };
    const click = (event: MouseEvent) => { if (Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>6) return; const p = point(event); if (p) onPoint(p); };
    canvas.addEventListener('dragover', over);
    canvas.addEventListener('drop', drop);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('click', click);
    return () => { canvas.removeEventListener('dragover', over); canvas.removeEventListener('drop', drop); canvas.removeEventListener('click', click); canvas.removeEventListener('pointerdown', down); };
  }, [camera, gl, pending, onPoint, onDrop]);
  const doors = room.doors.map(door => ({id: door.id, corners: demoDoorSwing(room, door)})).filter(zone => zone.corners.length);
  const highlightedRoom = pending ? {...room, furniture: [...room.furniture, pending]} : room;
  const highlights = demoOverlapHighlights(highlightedRoom);
  const shown = room.furniture.filter(item => item.status !== 'deleted' && (all || item.id === selectedId));
  const target = pending ?? room.furniture.find(item => item.id === selectedId);
  return <>
    {target && toolbar && <Html position={[target.position.x, target.dimensions.height + .35, target.position.z]} center zIndexRange={[30, 20]} calculatePosition={(_object, camera, size) => {
      const footprint=resolveFurnitureLocalFootprint(target);
      const corners=[footprint.minX,footprint.maxX].flatMap(x=>[footprint.minZ,footprint.maxZ].flatMap(z=>[0,target.dimensions.height].map(y=>new Vector3(target.position.x+x*Math.cos(target.rotationY)+z*Math.sin(target.rotationY),y-1,target.position.z-x*Math.sin(target.rotationY)+z*Math.cos(target.rotationY)).project(camera))));
      const xs=corners.map(p=>(p.x+1)*size.width/2),ys=corners.map(p=>(1-p.y)*size.height/2);
      const element=gl.domElement.closest('.demo-viewer')?.querySelector<HTMLElement>('.demo-floating-toolbar');
      const width=element?.offsetWidth ?? Math.min(390,size.width-16),height=element?.offsetHeight ?? 90;
      const center=(Math.min(...xs)+Math.max(...xs))/2;
      let top=Math.min(...ys)-height/2-12;
      if(top<height/2+8) top=Math.max(...ys)+height/2+12;
      const visibleHeight=Math.min(size.height,window.innerHeight-gl.domElement.getBoundingClientRect().top);
      return [Math.max(width/2+8,Math.min(size.width-width/2-8,center)),Math.max(height/2+8,Math.min(visibleHeight-height/2-8,top))];
    }}>{toolbar}</Html>}
    {doors.map(zone => <DoorZone key={zone.id} points={zone.corners} blocked={highlights.doors.has(zone.id)} />)}
    {shown.map(item => <FurnitureClearance key={item.id} item={item} states={highlights.zoneStatus.get(item.id)} />)}
    {pending && <><FurnitureMesh item={pending} room={room} isSelected canTransform={false} showSelectionIndicator directDrag onSelect={() => {}} onMove={(_id, point) => onPoint(point)} bodySeverity={demoPlacementReason(room, pending) ? 'ERROR' : null} /><FurnitureClearance item={pending} states={highlights.zoneStatus.get(pending.id)} /></>}
    {highlightedRoom.furniture.filter(item => item.status !== 'deleted' && (all || item.id === selectedId || item.id === pending?.id || highlights.status.get(item.id) !== 'clear')).map(item => {
      const footprint=resolveFurnitureLocalFootprint(item);
      return <group key={`collision-${item.id}`} position={[item.position.x,0,item.position.z]} rotation={[0,item.rotationY,0]}><FootprintDecal minX={footprint.minX-.06} maxX={footprint.maxX+.06} minZ={footprint.minZ-.06} maxZ={footprint.maxZ+.06} y={.03} color={DEMO_SPACE_COLORS[highlights.status.get(item.id) ?? 'clear']} opacity={.5} /></group>;
    })}
  </>;
}

function DoorZone({points, blocked}: {points: Vector2D[]; blocked: boolean}) {
  const shape = useMemo(() => {
    const shape = new Shape();
    points.forEach((point, index) => index === 0 ? shape.moveTo(point.x, -point.z) : shape.lineTo(point.x, -point.z));
    shape.closePath(); return shape;
  }, [points]);
  const color=blocked ? '#ef4444' : '#1677e8';
  return <><Line points={[...points,points[0]].map(point => [point.x,.025,point.z] as [number,number,number])} color={color} lineWidth={2} /><mesh position={[0, .02, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}><shapeGeometry args={[shape]} /><meshBasicMaterial color={color} transparent opacity={.42} toneMapped={false} depthWrite={false} side={DoubleSide} /></mesh></>;
}
