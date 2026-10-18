import { describe, expect, it } from 'vitest';
import { createFurniturePartGeometry } from '../geometryFactory';
import { validateFurnitureVariant } from '../validateFurnitureVariant';
import { makeTestMaterialCatalog, makeValidFurnitureVariant } from './fixtures';

const base = { id:'shape', material:'testWhite', position:[0,0,0] };
const shapes = [
  {geometry:'mesh', vertices:[0,0,0, 1,0,0, 0,1,0], indices:[0,1,2]},
  {geometry:'sweep', points:[[0,0,0],[0,1,0],[1,1,0]], radius:.02, segments:24, radialSegments:8},
  {geometry:'profile', profile:[[0,0],[.3,.2],[.2,.5]], segments:24},
];
function parse(shape:Record<string,unknown>) {
  return validateFurnitureVariant({...makeValidFurnitureVariant(), parts:[{...base,...shape}]},makeTestMaterialCatalog());
}
describe('sculpted furniture geometry',()=>{
  it.each(shapes)('validates and renders $geometry without replacing its silhouette', shape=>{
    const part=parse(shape).parts[0];
    const geometry=createFurniturePartGeometry(part);
    geometry.computeBoundingBox();
    expect(geometry.attributes.position.count).toBeGreaterThanOrEqual(3);
    expect(geometry.boundingBox?.isEmpty()).toBe(false);
    expect(geometry.attributes.normal).toBeDefined();
    geometry.dispose();
  });
  it.each([-1,3,.5,NaN])('rejects an invalid mesh vertex index %s',index=>{
    expect(()=>parse({...shapes[0],indices:[0,1,index]})).toThrow();
  });
  it('rejects incomplete triangles and nonfinite vertices',()=>{
    expect(()=>parse({...shapes[0],indices:[0,1]})).toThrow();
    expect(()=>parse({...shapes[0],vertices:[0,0,0,Infinity,0,0,0,1,0]})).toThrow();
  });
  it('rejects degenerate or invalid procedural input',()=>{
    expect(()=>parse({...shapes[1],points:[[0,0,0]]})).toThrow();
    expect(()=>parse({...shapes[1],closed:'yes'})).toThrow();
    expect(()=>parse({...shapes[2],profile:[]})).toThrow();
    expect(()=>parse({...shapes[2],profile:[[-1,0],[.2,1]]})).toThrow();
  });
});
