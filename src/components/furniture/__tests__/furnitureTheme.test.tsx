import { Children, isValidElement, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import Material from '../../materials/Material';
import Bed from '../Bed';
import Table from '../Table';
import Chair from '../Chair';
import Sofa from '../Sofa';
import Storage from '../Storage';
import Bookshelf from '../Bookshelf';
import { furnitureThemeColors } from '../furnitureTheme';
import type { Furniture } from '../../../types';

function elements(element: ReactElement): ReactElement<Record<string, unknown>>[] {
  const current=element as ReactElement<Record<string,unknown>>;
  return [current,...Children.toArray(current.props.children as ReactElement).flatMap(child=>isValidElement(child)?elements(child):[])];
}
const item:Furniture={id:'scan',name:'스캔 가구',category:'cabinet',dimensions:{width:1.4,depth:.7,height:1.1},position:{x:1,z:-1},rotationY:.4,color:'#c8a877',material:'wood',status:'existing',removable:true};
describe('legacy furniture colour roles',()=>{
  it.each([Bed,Table,Chair,Sofa,Storage,Bookshelf])('themes %s without changing scan geometry or source data',Component=>{
    const before=structuredClone(item);
    const original=elements(Component({item})),themed=elements(Component({item,colors:furnitureThemeColors('green')}));
    const geometry=(tree:typeof original)=>tree.filter(e=>typeof e.type==='string'&&e.type.endsWith('Geometry')).map(e=>e.props.args);
    expect(geometry(themed)).toEqual(geometry(original));
    expect(themed.filter(e=>e.type===Material).some(e=>original.some(o=>o.type===Material&&o.props.color!==e.props.color))).toBe(true);
    expect(item).toEqual(before);
  });
  it('keeps glass tabletops and separates timber legs from the selected colour',()=>{
    const glass={...item,geometry:'box' as const,material:{type:'glass' as const,color:'#abcdef',roughness:.1}};
    const surfaces=elements(Table({item:glass,colors:furnitureThemeColors('green')})).filter(e=>e.type===Material);
    expect(surfaces[0].props.color).toBe('#abcdef');
    expect(surfaces[1].props.color).toBe(furnitureThemeColors('green')!.wood[1]);
  });
  it('keeps office chair metal distinct from its upholstery',()=>{
    const surfaces=elements(Chair({item:{...item,theme:'gray'},colors:furnitureThemeColors('green')})).filter(e=>e.type===Material);
    expect(surfaces.find(e=>e.props.type==='metal')!.props.color).toBe(furnitureThemeColors('green')!.accent[0]);
    expect(surfaces[0].props.color).not.toBe(surfaces.find(e=>e.props.type==='metal')!.props.color);
  });
});
