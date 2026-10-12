import { describe, expect, it } from 'vitest';
import { generateRecommendations, type RecommendationOptions } from './engine';
import { getLayoutAppliedColorScheme, getLayoutAppliedPreferredColorTone } from '../config/appliedColorTone';
import { layoutDistance } from './designGuidelines';
import { validateRecommendationLayout } from './layoutValidation';
import fixture from './layoutRegression.fixture.json';
import type { RoomLayout } from '../types';
const room=fixture as RoomLayout;
const options:RecommendationOptions={mode:'rearrange',palette:'auto',style:'natural',purpose:'휴식',keepTypes:true,keepSizes:true};
describe('automatic colour recommendations',()=>{
  it('adds distinct palettes to genuine spatial alternatives, preserving the draft and furniture',()=>{
    const original=structuredClone(room),result=generateRecommendations(room,options);
    expect(result.proposals).toHaveLength(3);expect(room).toEqual(original);
    expect(new Set(result.proposals.map(proposal=>getLayoutAppliedColorScheme(proposal.room))).size).toBe(3);
    for(const p of result.proposals) {expect(p.changedFurniture).toBe(0);expect(validateRecommendationLayout(p.room).valid).toBe(true);}
    for(let i=0;i<3;i++) for(let j=i+1;j<3;j++) expect(layoutDistance(result.proposals[i].room,result.proposals[j].room)).toBeGreaterThanOrEqual(.16);
  });
  it('can compare colour-only alternatives when every furniture pose and model is fixed',()=>{
    const fixed={...room,furniture:room.furniture.map(item=>({...item,recommendationLocked:true}))};
    const result=generateRecommendations(fixed,{...options,mode:'preserve'});
    expect(result.proposals).toHaveLength(3);
    for(const p of result.proposals) {expect(p.room.furniture).toEqual(fixed.furniture);expect(p.title).toContain('색 조합');}
    expect(new Set(result.proposals.map(p=>p.room.appliedColorSchemeId)).size).toBe(3);
  });
  it('removes the automatic palette when a subsequent manual colour is applied',()=>{
    const initial=generateRecommendations(room,options).proposals[0].room;
    const manual=generateRecommendations(initial,{...options,palette:'green'});
    expect(manual.proposals.length).toBeGreaterThan(0);
    for(const p of manual.proposals) {expect(getLayoutAppliedColorScheme(p.room)).toBeNull();expect(getLayoutAppliedPreferredColorTone(p.room)).toBe('green');}
  });
  it('keeps invalid/failing requests from turning into colour-only proposals',()=>{
    expect(generateRecommendations({...room,width:0},options).proposals).toHaveLength(0);
    expect(generateRecommendations(room,{...options,palette:'not-a-palette' as RecommendationOptions['palette']}).proposals).toHaveLength(0);
  });
});
