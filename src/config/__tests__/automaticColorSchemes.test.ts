import { beforeAll } from "vitest";
import { describe, expect, it } from 'vitest';
import { AUTOMATIC_COLOR_SCHEMES, automaticFurniturePalette, getAutomaticColorScheme, rankAutomaticColorSchemes } from '../automaticColorSchemes';
import { getFurnitureThemePalette, getThemeTarget, THEME_PALETTES } from '../furnitureBehaviorPolicy';
import { getLayoutAppliedColorScheme, withAppliedColorScheme, withAppliedPreferredColorTone } from '../appliedColorTone';
import { toPreferredColorToneApiValue } from '../preferredColorTone';
import { createProductionFurnitureCatalog } from '../../components/furniture/variants/productionFurnitureCatalog';
import { resolveMaterialPreset } from '../../components/furniture/variants/materialResolver';
import fixture from '../../recommendation/layoutRegression.fixture.json';
import type { RoomLayout } from '../../types';
const room=fixture as RoomLayout;

describe('automatic furniture colour schemes',()=>{
  it('ranks schemes deterministically using style, lifestyle and floor undertone',()=>{
    const warm={...room,floor:{size:{width:room.width,depth:room.depth},material:{color:'#c2996a',roughness:.6}}};
    const cold={...warm,floor:{...warm.floor,material:{color:'#7799aa',roughness:.6}}};
    expect(rankAutomaticColorSchemes(warm,'modern','휴식')[0].id).toBe('linen-blue');
    expect(rankAutomaticColorSchemes(cold,'modern','휴식')[0].id).toBe('blush-navy');
    expect(rankAutomaticColorSchemes(warm,'natural','수납')[0].id).toBe('sage-cream');
    expect(rankAutomaticColorSchemes(warm,'midcentury','취미 / 여가')[0].id).toBe('teal-sand');
    expect(rankAutomaticColorSchemes(warm,'modern','휴식')).toEqual(rankAutomaticColorSchemes(warm,'modern','휴식'));
  });
  it('gives storage, upholstery and small accessories different colour roles',()=>{
    const scheme=AUTOMATIC_COLOR_SCHEMES[0];
    expect(automaticFurniturePalette(scheme.id,'wardrobe').primary).toEqual(scheme.palette.primary);
    expect(automaticFurniturePalette(scheme.id,'bed').primary).toEqual(scheme.palette.secondary);
    expect(automaticFurniturePalette(scheme.id,'DESK_CHAIR').primary).toEqual(scheme.palette.secondary);
    expect(automaticFurniturePalette(scheme.id,'plant').primary).toEqual(scheme.palette.accent);
    for(const tone of Object.keys(THEME_PALETTES)) expect(getFurnitureThemePalette(tone,'bed')).toEqual(getFurnitureThemePalette(tone,'wardrobe'));
  });
  it('covers every catalog model in all six schemes without changing protected surfaces or PBR',()=>{
    const catalog=loadedCatalog;
    for(const variant of catalog.variants) for(const scheme of AUTOMATIC_COLOR_SCHEMES) {
      let changed=false;
      for(const part of variant.parts) {
        const before=resolveMaterialPreset(part.material,catalog.materialPresets);
        const target=getThemeTarget(variant.variantId,part.id);
        const after=resolveMaterialPreset(part.material,catalog.materialPresets,scheme.id,target,`${variant.variantId}:${part.id}`,variant.furnitureType);
        if(before.color!==after.color) changed=true;
        if(target?.slot==='preserve') expect(after).toEqual(before);
        const {color:beforeColor,...beforePbr}=before,{color:afterColor,...afterPbr}=after;
        expect(typeof beforeColor).toBe('string');expect(afterColor).toMatch(/^#[\dA-F]{6}$/i);
        expect(afterPbr).toEqual(beforePbr);
      }
      expect(changed,`${variant.variantId}/${scheme.id}`).toBe(variant.parts.some(part=>getThemeTarget(variant.variantId,part.id)?.slot!=="preserve"));
    }
  });
  it('round-trips automatic schemes and clears them when switching to a manual tone',()=>{
    const original=structuredClone(room),automatic=withAppliedColorScheme(room,'sage-cream');
    expect(getLayoutAppliedColorScheme(JSON.parse(JSON.stringify(automatic)))).toBe('sage-cream');
    expect(room).toEqual(original);expect(getLayoutAppliedColorScheme(withAppliedPreferredColorTone(automatic,'blue'))).toBeNull();
    expect(getAutomaticColorScheme('__proto__')).toBeNull();expect(getFurnitureThemePalette('invalid')).toBeUndefined();
    expect(toPreferredColorToneApiValue('auto')).toBeNull();expect(toPreferredColorToneApiValue('sage-cream')).toBeNull();
  });
});

let loadedCatalog: Awaited<ReturnType<typeof createProductionFurnitureCatalog>>;
beforeAll(async()=>{loadedCatalog=await createProductionFurnitureCatalog();});
