import { describe, expect, it } from 'vitest';
import { buildWorkspaceFeedbackRequest, prepareWorkspaceFeedbackPreview } from '../workspaceFeedback';
import type { RoomLayout } from '../../types';
import type { WorkspaceFeedbackResponse } from '../../api/workspaceFeedback';
import catalog from '../../data/furniture/catalog.json';

const room: RoomLayout = {
  id:'api-room-1',name:'테스트',width:6,depth:6,height:2.7,walls:[],doors:[],windows:[],appliedColorSchemeId:'sage-cream',
  furniture:[{id:'desk-1',name:'책상',category:'desk',sourceType:'desk',productId:'desk-compact-01',variantId:'desk-compact',
    styleTags:['minimal'],dimensions:{width:1.2,depth:.6,height:.72},position:{x:0,z:0},rotationY:-5*Math.PI/180,
    color:'#849a82',material:{type:'wood',color:'#849a82'},model:'custom.glb',theme:'wood',mountHeight:.1,
    demoVisualScale:[1.05,1,1],resizeBaseDimensions:{width:1.14,depth:.6,height:.72},status:'user_modified',removable:true}],
};
const request = () => buildWorkspaceFeedbackRequest(structuredClone(room),1,'revision-1','책상을 방 기준 오른쪽으로 이동',
  {purpose:'업무 / 공부',style:'minimal',palette:'auto'},'desk-1');
function response(): WorkspaceFeedbackResponse {
  const input = request();
  return {revision:input.revision,status:'SUCCESS',source:'LLM',reasonCode:null,summary:'후보',clarification:null,
    furniture:input.furniture.map(item=>({...item,position:{...item.position,x:item.position.x+.2}})),
    operationResults:[{operationId:'op-1',type:'MOVE',status:'APPLIED',reasonCode:null,affectedFurnitureId:'desk-1'}],
    validationResult:{collisionFree:true,boundaryValid:true,doorClearance:true,windowClearance:true,pathSecured:true,warnings:[]}};
}

describe('workspace feedback snapshot and candidate',()=>{
  it('converts the latest pose and includes catalog metadata and locks',()=>{
    const base=structuredClone(room);base.furniture[0].recommendationLocked=true;
    const result=buildWorkspaceFeedbackRequest(base,7,'r','이동',{purpose:'수납',style:'classic',palette:'green'},'desk-1');
    expect(result.furniture[0]).toMatchObject({type:'desk',position:{x:3,z:3},rotation:5,productId:'desk-compact-01',variantId:'desk-compact',styleTags:['minimal'],status:'USER_MODIFIED'});
    expect(result.lockedFurnitureIds).toEqual(['desk-1']);expect(result.roomId).toBe(7);
  });
  it('rejects missing owner, too many furniture and overly long input before calling API',()=>{
    expect(()=>buildWorkspaceFeedbackRequest(room,0,'r','이동',{purpose:'휴식',style:'natural',palette:'auto'},null)).toThrow();
    const large={...room,furniture:Array.from({length:13},(_,i)=>({...room.furniture[0],id:String(i)}))};
    expect(()=>buildWorkspaceFeedbackRequest(large,1,'r','이동',{purpose:'휴식',style:'natural',palette:'auto'},null)).toThrow();
    expect(()=>buildWorkspaceFeedbackRequest(room,1,'r','a'.repeat(2001),{purpose:'휴식',style:'natural',palette:'auto'},null)).toThrow();
  });
  it('preserves appearance, scaling, mounting and automatic palette when moving',()=>{
    const before=JSON.stringify(room);const preview=prepareWorkspaceFeedbackPreview(room,request(),response());
    expect(preview.room.appliedColorSchemeId).toBe('sage-cream');
    expect(preview.room.furniture[0]).toMatchObject({...room.furniture[0],position:preview.room.furniture[0].position});
    expect(preview.room.furniture[0].position.x).toBeCloseTo(.2);
    expect(preview.room.furniture[0].rotationY).toBeCloseTo(room.furniture[0].rotationY);
    expect(preview.validation.valid).toBe(true);expect(preview.changes).toEqual(['책상: 위치 이동']);
    expect(JSON.stringify(room)).toBe(before);
  });
  it('rejects wrong revision, fake AI source and incomplete server validation',()=>{
    expect(()=>prepareWorkspaceFeedbackPreview(room,request(),{...response(),revision:'old'})).toThrow();
    expect(()=>prepareWorkspaceFeedbackPreview(room,request(),{...response(),source:'RULE_BASED'} as unknown as WorkspaceFeedbackResponse)).toThrow();
    const failed=response();failed.validationResult.windowClearance=false;
    expect(()=>prepareWorkspaceFeedbackPreview(room,request(),failed)).toThrow();
  });
  it('blocks rotation mixed into a move and deleting locked furniture',()=>{
    const mixed=response();mixed.furniture[0].rotation=90;
    expect(()=>prepareWorkspaceFeedbackPreview(room,request(),mixed)).toThrow('변경 범위');
    const input=request();input.lockedFurnitureIds=['desk-1'];
    expect(()=>prepareWorkspaceFeedbackPreview(room,input,response())).toThrow('고정 조건');
    const removed=response();removed.furniture=[];removed.operationResults[0].type='REMOVE_FURNITURE';
    expect(()=>prepareWorkspaceFeedbackPreview(room,input,removed)).toThrow('유지해야');
  });
  it('rejects duplicate IDs, unknown items and status changes',()=>{
    const duplicated=response();duplicated.furniture.push(duplicated.furniture[0]);
    expect(()=>prepareWorkspaceFeedbackPreview(room,request(),duplicated)).toThrow('중복');
    const unknown=response();unknown.furniture[0].id='unknown';
    expect(()=>prepareWorkspaceFeedbackPreview(room,request(),unknown)).toThrow();
    const lifecycle=response();lifecycle.furniture[0].status='DELETED';
    expect(()=>prepareWorkspaceFeedbackPreview(room,request(),lifecycle)).toThrow();
  });
  it('retains exact invalid pose for inspection and blocks applying a window obstruction',()=>{
    const base=structuredClone(room);base.windows=[{id:'window-1',label:'창문',wallId:'north',position:{x:0,z:-3},dimensions:{width:2,depth:.1,height:1.2},rotationY:0,sillHeight:.2}];
    base.walls=[{id:'north',start:{x:-3,z:-3},end:{x:3,z:-3}}];
    const input=buildWorkspaceFeedbackRequest(base,1,'revision-1','창문 근처로 이동',{purpose:'휴식',style:'natural',palette:'auto'},'desk-1');
    const result=response();result.furniture[0].position={x:3,z:.3};
    const prepared=prepareWorkspaceFeedbackPreview(base,input,result);
    expect(prepared.room.furniture[0].position.z).toBeCloseTo(-2.7);
    expect(prepared.validation.valid).toBe(false);expect(prepared.validation.reasons.join()).toContain('채광 공간');
  });
  it('replaces geometry metadata using a renderable product while preserving room and pose',()=>{
    const result=response(),input=request();const product=catalog.products.find(item=>item.furnitureType==='desk'&&item.productId!=='desk-compact-01')!;
    result.furniture[0]={...input.furniture[0],productId:product.productId,variantId:product.variantId,label:product.label,
      width:product.dimensions.width,depth:product.dimensions.depth,height:product.dimensions.height,styleTags:product.styleTags};
    result.operationResults[0].type='REPLACE_PRODUCT';
    const preview=prepareWorkspaceFeedbackPreview(room,input,result);
    expect(preview.room.furniture[0].productId).toBe(product.productId);
    expect(preview.room.furniture[0].model).toBeUndefined();expect(preview.room.furniture[0].demoVisualScale).toBeUndefined();
    expect(preview.room.furniture[0].position).toEqual(room.furniture[0].position);
    expect(preview.room.appliedColorSchemeId).toBe(room.appliedColorSchemeId);
  });
  it('accepts only explicitly requested additions and removals',()=>{
    const result=response(),input=request();const product=catalog.products.find(item=>item.furnitureType==='mood_lamp')!;
    result.operationResults=[{operationId:'remove',type:'REMOVE_FURNITURE',status:'APPLIED',reasonCode:null,affectedFurnitureId:'desk-1'},
      {operationId:'add',type:'ADD_FURNITURE',status:'APPLIED',reasonCode:null,affectedFurnitureId:'lamp-new'}];
    result.furniture=[{id:'lamp-new',type:product.furnitureType,label:product.label,position:{x:3,z:3},rotation:0,status:'RECOMMENDED',productId:product.productId,variantId:product.variantId,styleTags:product.styleTags,
      width:product.dimensions.width,depth:product.dimensions.depth,height:product.dimensions.height}];
    expect(prepareWorkspaceFeedbackPreview(room,input,result).room.furniture.map(item=>item.id)).toEqual(['lamp-new']);
    result.operationResults.pop();expect(()=>prepareWorkspaceFeedbackPreview(room,input,result)).toThrow('추가');
  });
});
