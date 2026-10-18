import { execFileSync } from 'node:child_process';
import { readFile,mkdir,writeFile,rename } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSculptedFurniturePart } from '../src/geometry/sculptedFurnitureGeometry.mjs';
const WEB_ROOT=fileURLToPath(new URL('../',import.meta.url));
const metadata=JSON.parse(readFileSync(path.join(WEB_ROOT,'src/data/furniture/expansionMetadata.json'),'utf8'));
export function readExpansionArchive(archive){
 const python=`import zipfile,json,sys
with zipfile.ZipFile(sys.argv[1]) as z:
 names=z.namelist()
 if len(names)!=len(set(names)) or any(n.startswith('/') or '..' in n.split('/') for n in names): raise ValueError('Unsafe archive paths')
 root='roomfit-new-100/'
 manifest=json.loads(z.read(root+'manifest.json'))
 models=[]
 for r in manifest['models']:
  f=r['file']
  if not f.startswith('models/') or '/' in f[len('models/'):]: raise ValueError('Invalid model path')
  models.append(json.loads(z.read(root+f)))
 print(json.dumps({'models':models,'materials':json.loads(z.read(root+'materials.json'))},ensure_ascii=False))`;
 return JSON.parse(execFileSync('python3',['-c',python,path.resolve(archive)],{encoding:'utf8',maxBuffer:64*1024*1024}));
}
export function normalizeExpansionModels(payload){
 if(!Array.isArray(payload.models)||payload.models.length!==100)throw new Error('Expected exactly 100 models');
 const ids=new Set(),geometries=new Set(['mesh','sweep','profile','box','roundedBox','cylinder','extrudedPolygon','ellipsoid']);
 return payload.models.map(model=>{
  const m=metadata[model.id];if(!m||ids.has(model.id))throw new Error('Missing or duplicate model identifier');ids.add(model.id);
  if(model.units!=='meter'||model.rotationUnit!=='radian'||model.coordinateSystem?.origin!=='floor-center')throw new Error('Invalid model coordinate system');
  if(!['width','height','depth'].every(k=>Number.isFinite(model.dimensions?.[k])&&model.dimensions[k]>0))throw new Error('Invalid model dimensions');
  if(!Array.isArray(model.parts)||!model.parts.length||new Set(model.parts.map(p=>p.id)).size!==model.parts.length)throw new Error('Invalid model parts');
  for(const part of model.parts){
   if(!geometries.has(part.geometry)||!model.materials.includes(part.material)||!payload.materials[part.material])throw new Error('Unresolved geometry or material');
   if(['mesh','profile','sweep'].includes(part.geometry))assertSculptedFurniturePart(part);
  }
  const {id:_id,category:_category,...source}=model;
  return {...source,variantId:m.variantId,furnitureTypeCode:m.furnitureTypeCode,styleTags:m.styleTags,lifestyleTags:m.lifestyleTags,purchaseUrl:model.purchaseUrl??null};
 });
}
async function atomicJson(file,data){await writeFile(file+'.tmp',JSON.stringify(data,null,2)+'\n');await rename(file+'.tmp',file);}
async function main(){
 const i=process.argv.indexOf('--archive');if(i<0||!process.argv[i+1])throw new Error('Use --archive <zip-path>');
 const payload=readExpansionArchive(process.argv[i+1]),models=normalizeExpansionModels(payload);
 const root=path.join(WEB_ROOT,'src/data/furniture'),materials=JSON.parse(await readFile(path.join(root,'materials.json'),'utf8'));
 for(const [key,value]of Object.entries(payload.materials)){
  if(materials.materials[key]&&JSON.stringify(materials.materials[key])!==JSON.stringify(value))throw new Error(`Material conflict: ${key}`);
 }
 await mkdir(path.join(root,'variants'),{recursive:true});
 for(const model of models)await atomicJson(path.join(root,'variants',model.variantId+'.json'),model);
 await atomicJson(path.join(root,'materials.json'),{...materials,materials:{...materials.materials,...payload.materials}});
 process.stdout.write(`Imported ${models.length} new models without changing existing variant files.\n`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
