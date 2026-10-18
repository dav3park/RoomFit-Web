import type { BufferGeometry } from 'three';
import type { MeshFurniturePart, ProfileFurniturePart, SweepFurniturePart } from '../components/furniture/variants/types';
export function createSculptedFurnitureGeometry(part: MeshFurniturePart|ProfileFurniturePart|SweepFurniturePart): BufferGeometry;
export function assertSculptedFurniturePart(part: unknown): void;
