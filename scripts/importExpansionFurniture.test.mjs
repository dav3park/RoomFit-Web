import {describe,it,expect} from 'vitest';
import {readExpansionArchive,normalizeExpansionModels} from './importExpansionFurniture.mjs';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
const root=new URL('../src/data/furniture/',import.meta.url);
const payload={materials:JSON.parse(readFileSync(new URL('materials.json',root),'utf8')).materials,models:Array.from({length:100},(_,index)=>{
 const id=String(index+1).padStart(3,'0');
 const {variantId:_variantId,furnitureTypeCode:_type,styleTags:_styles,lifestyleTags:_lifestyle,...model}=JSON.parse(readFileSync(new URL(`variants/expansion-c${id}.json`,root),'utf8'));
 return {...model,id:`C${id}`};
})};
describe('new furniture archive import',()=>{
 it('preserves all 100 shapes with stable unique catalog identifiers',()=>{
  const models=normalizeExpansionModels(payload);
  expect(models).toHaveLength(100);expect(new Set(models.map(m=>m.variantId)).size).toBe(100);
  expect(models[0].variantId).toBe('expansion-c001');expect(models[99].variantId).toBe('expansion-c100');
  for(let i=0;i<models.length;i++){expect(models[i].parts).toEqual(payload.models[i].parts);expect(models[i].dimensions).toEqual(payload.models[i].dimensions);expect(models[i].styleTags.length).toBeGreaterThan(0);}
 });
 it('rejects missing or duplicated models before writing assets',()=>{
  expect(()=>normalizeExpansionModels({...payload,models:payload.models.slice(1)})).toThrow();
  const models=[...payload.models];models[1]=models[0];expect(()=>normalizeExpansionModels({...payload,models})).toThrow();
 });
 it('reads an archive without executing its source scripts and rejects traversal paths',()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'roomfit-import-')),archive=path.join(directory,'fixture.zip');
  try{
   const write=unsafe=>execFileSync('python3',['-c',`import zipfile,sys
with zipfile.ZipFile(sys.argv[1],'w') as z:
 z.writestr('roomfit-new-100/manifest.json','{"models":[]}')
 z.writestr('roomfit-new-100/materials.json','{}')
 z.writestr('roomfit-new-100/source/DO_NOT_EXECUTE.py','raise RuntimeError("must not execute")')
 if sys.argv[2]=='true':z.writestr('../outside.txt','unsafe')`,archive,String(unsafe)]);
   write(false);expect(readExpansionArchive(archive)).toEqual({models:[],materials:{}});
   write(true);expect(()=>readExpansionArchive(archive)).toThrow();
  }finally{rmSync(directory,{recursive:true,force:true});}
 });
});
