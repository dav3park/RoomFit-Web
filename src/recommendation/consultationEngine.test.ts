import {describe,it,expect} from 'vitest';
import {generateRecommendations,type RecommendationOptions} from './engine';
import {validateRecommendationLayout,furnitureType} from './layoutValidation';
import {auditConsultationProposal} from './consultationAudit';
import catalog from '../data/furniture/catalog.json';
import {DEMO_ROOMS} from '../pages/workspaceDemoState';
const room=structuredClone(DEMO_ROOMS.find(room=>room.width>5)!);
const options:RecommendationOptions={purpose:'업무 / 공부',style:'natural',palette:'beige',mode:'new',keepTypes:false,keepSizes:false,seed:14,
 constraints:{counts:{desk:1,bookshelf:1,plant:2},excludedTypes:['wardrobe'],keepIds:[],strictStyle:false}};
describe('consultation engine constraints',()=>{
 it('uses exact furniture counts and excludes types from every generated candidate',()=>{
  const result=generateRecommendations(room,options);expect(result.proposals.length).toBeGreaterThan(0);
  for(const proposal of result.proposals){
   for(const [type,count]of Object.entries(options.constraints!.counts))expect(proposal.room.furniture.filter(item=>item.sourceType===type)).toHaveLength(count);
   expect(proposal.room.furniture.some(item=>item.sourceType==='wardrobe')).toBe(false);
   expect(validateRecommendationLayout(proposal.room).valid).toBe(true);
  }
 },30000);
 it('honors studio proposals for multiple large items and a small storage count',()=>{
  const proposed={...options,purpose:'휴식' as const,constraints:{counts:{sofa:2,bookshelf:1},excludedTypes:['wardrobe'],keepIds:[],strictStyle:false}};
  const result=generateRecommendations(room,proposed);
  expect(result.proposals.length).toBeGreaterThan(0);
  for(const candidate of result.proposals){
   expect(auditConsultationProposal(candidate.room,proposed,room).valid).toBe(true);
   expect(candidate.room.furniture.filter(item=>item.sourceType==='sofa')).toHaveLength(2);
   expect(candidate.room.furniture.filter(item=>item.sourceType==='bookshelf')).toHaveLength(1);
  }
 },30000);
 it('keeps an explicitly preserved item unchanged without mutating the source',()=>{
  const original=room.furniture.find(item=>furnitureType(item)==='bed')!;expect(original).toBeTruthy();const before=structuredClone(room);
  const result=generateRecommendations(room,{...options,constraints:{counts:{desk:1},excludedTypes:['wardrobe'],keepIds:[original.id],strictStyle:false}});
  expect(result.proposals.length).toBeGreaterThan(0);
  for(const p of result.proposals)expect(p.room.furniture.find(item=>item.id===original.id)).toEqual(original);
  expect(room).toEqual(before);
 },30000);
 it('returns no candidates instead of silently dropping forbidden, conflicting or impossible requirements',()=>{
  const original=room.furniture[0];
  const cases:NonNullable<RecommendationOptions["constraints"]>[]=[
   {counts:{desk:1},excludedTypes:['desk'],keepIds:[],strictStyle:false},
   {counts:{},excludedTypes:[furnitureType(original)],keepIds:[original.id],strictStyle:false},
   {counts:{bookshelf:25},excludedTypes:[],keepIds:[],strictStyle:false},
   {counts:{},excludedTypes:[],keepIds:['fake'],strictStyle:false},
  ];
  for(const constraints of cases)expect(generateRecommendations(room,{...options,constraints}).proposals).toEqual([]);
 });
 it('does not treat an integrated loft desk as satisfying a desk exclusion',()=>{
  const product=catalog.products.find(item=>item.variantId==='bed-loft-desk')!;
  const original={...room.furniture[0],id:'loft',sourceType:'bed',category:'bed' as const,variantId:product.variantId,productId:product.productId,dimensions:product.dimensions,position:{x:0,z:0},rotationY:0};
  const result=generateRecommendations({...room,furniture:[original]},{...options,purpose:'휴식',constraints:{counts:{},excludedTypes:['desk'],keepIds:['loft'],strictStyle:false}});
  expect(result.proposals).toHaveLength(0);
 });
});
