import type { RoomLayout } from '../types';
import { prepareFurniture } from './layoutValidation';
import { demoDoorSwing } from '../pages/demoPlacement';
export default function RecommendationThumbnail({room}:{room:RoomLayout}) {
  const closed=room.walls.length>=3&&Math.hypot(room.walls.at(-1)!.end.x-room.walls[0].start.x,room.walls.at(-1)!.end.z-room.walls[0].start.z)<.02;
  const points=(items:{x:number;z:number}[])=>items.map(p=>`${p.x},${p.z}`).join(' ');
  return <svg className="recommendation-thumbnail" viewBox={`${-room.width/2-.2} ${-room.depth/2-.2} ${room.width+.4} ${room.depth+.4}`} aria-hidden="true">
    {closed ? <polygon points={points(room.walls.map(wall=>wall.start))} fill="#fbfbfb" /> : <rect x={-room.width/2} y={-room.depth/2} width={room.width} height={room.depth} fill="#fbfbfb" />}
    {room.furniture.map(item=><polygon key={item.id} points={points(prepareFurniture(item).body)} fill="#d6c5ad" stroke="#666666" strokeWidth=".035" />)}
    {room.walls.map(wall=><line key={wall.id} x1={wall.start.x} y1={wall.start.z} x2={wall.end.x} y2={wall.end.z} stroke="#141414" strokeWidth=".06" />)}
    {room.doors.map(door=><polygon key={door.id} points={points(demoDoorSwing(room,door))} fill="none" stroke="#1877ee" strokeWidth=".035" />)}
  </svg>;
}
