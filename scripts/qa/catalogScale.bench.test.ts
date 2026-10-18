import {it,expect,vi} from 'vitest';
import {writeFileSync} from 'node:fs';
import document from '../../src/data/furniture/catalog.json';
import originalIds from '../../src/data/furniture/originalVariantIds.json';
it.skipIf(process.env.ROOMFIT_CATALOG_BENCHMARK!=='1')('compares 93 and 193 products with the same requests and seeds',async()=>{
 const output=[];
 for(const count of [93,193]){
  vi.resetModules();
  vi.doMock('../../src/data/furniture/catalog.json',()=>({default:{...document,variantCount:count,products:count===93?document.products.filter(p=>originalIds.includes(p.variantId)):document.products}}));
  const {generateRecommendations}=await import('../../src/recommendation/engine');
  const {DEMO_ROOMS}=await import('../../src/pages/workspaceDemoState');
  const options={purpose:'업무 / 공부' as const,style:'natural' as const,palette:'beige' as const,mode:'new' as const,keepTypes:false,keepSizes:false,constraints:{counts:{desk:1,bookshelf:1,plant:3},excludedTypes:['wardrobe'],keepIds:[],strictStyle:false}};
  generateRecommendations(DEMO_ROOMS[0],{...options,seed:41});
  const timings=[];
  for(let i=0;i<10;i++){const start=performance.now();const result=generateRecommendations(DEMO_ROOMS[0],{...options,seed:41+i});timings.push(performance.now()-start);expect(result.proposals.length).toBeGreaterThan(0);}
  const sorted=timings.slice().sort((a,b)=>a-b);output.push({count,timingsMs:timings,medianMs:(sorted[4]+sorted[5])/2,p95Ms:sorted[9]});
 }
 writeFileSync('../docs/ui-tooling/qa/furniture-193-2026-10-18/catalog-performance.json',JSON.stringify(output,null,2));
 vi.doUnmock('../../src/data/furniture/catalog.json');
},120000);
