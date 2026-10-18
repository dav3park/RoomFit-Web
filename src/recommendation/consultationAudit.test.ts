import {describe,it,expect} from 'vitest';
import {auditConsultationProposal} from './consultationAudit';
import {generateRecommendations,type RecommendationOptions} from './engine';
import {DEMO_ROOMS} from '../pages/workspaceDemoState';
import catalog from '../data/furniture/catalog.json';
const options:RecommendationOptions={purpose:'업무 / 공부',style:'natural',palette:'beige',mode:'new',keepTypes:false,keepSizes:false,seed:14,constraints:{counts:{desk:1,bookshelf:1,plant:3},excludedTypes:['wardrobe'],keepIds:[],strictStyle:false}};
describe('independent consultation result audit',()=>{
 it('verifies real catalog contents and lists recognizable product names',()=>{
  const room=generateRecommendations(DEMO_ROOMS[0],options).proposals[0].room;
  const result=auditConsultationProposal(room,options,DEMO_ROOMS[0]);
  expect(result.valid).toBe(true);expect(result.checks.some(check=>check.label.includes('옷장')&&check.actual===0&&check.expected===0)).toBe(true);
  expect(result.inventory.some(item=>item.type==='bookshelf'&&catalog.products.some(product=>product.furnitureType==='bookshelf'&&product.label===item.name))).toBe(true);
 });
 it('rejects a wardrobe disguised as a bookshelf and a valid-looking broken count',()=>{
  const room=generateRecommendations(DEMO_ROOMS[0],options).proposals[0].room;
  const wardrobe=catalog.products.find(item=>item.furnitureType==='wardrobe')!;
  const disguised={...room,furniture:room.furniture.map(item=>item.sourceType==='bookshelf'?{...item,productId:wardrobe.productId,variantId:wardrobe.variantId}:item)};
  expect(auditConsultationProposal(disguised,options,DEMO_ROOMS[0]).valid).toBe(false);
  expect(auditConsultationProposal({...room,furniture:room.furniture.filter(item=>item.sourceType!=='bookshelf')},options,DEMO_ROOMS[0]).valid).toBe(false);
 });
 it('uses catalog styles rather than forged candidate tags for a mandatory style',()=>{
  const room=generateRecommendations(DEMO_ROOMS[0],options).proposals[0].room;
  const product=catalog.products.find(item=>item.productId==='bookshelf-double-open-01')!;
  const candidate={...room,furniture:room.furniture.filter(item=>item.sourceType==='bookshelf').map(item=>({...item,styleTags:['natural'],productId:product.productId,variantId:product.variantId}))};
  const strict={...options,constraints:{...options.constraints!,counts:{bookshelf:1},strictStyle:true}};
  expect(auditConsultationProposal(candidate,strict,DEMO_ROOMS[0]).valid).toBe(false);
 });

});
