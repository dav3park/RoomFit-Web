import { describe, expect, it } from 'vitest';
import { recommendationRandom, sampleWeighted } from './sampling';

describe('bounded recommendation sampling',()=>{
  it('reproduces the same request seed and never samples an entry twice',()=>{
    const values=Array.from({length:100},(_,i)=>i);
    const first=sampleWeighted(values,6,()=>1,recommendationRandom(42));
    expect(sampleWeighted(values,6,()=>1,recommendationRandom(42))).toEqual(first);
    expect(new Set(first).size).toBe(6);
    expect(values).toEqual(Array.from({length:100},(_,i)=>i));
  });
  it('reaches the whole eligible pool instead of a permanently truncated prefix',()=>{
    const values=Array.from({length:100},(_,i)=>i),seen=new Set<number>();
    for(let seed=0;seed<256;seed++) for(const item of sampleWeighted(values,6,()=>1,recommendationRandom(seed))) seen.add(item);
    expect(seen.size).toBe(100);
  });
  it('favours compatible high-weight choices while retaining exploration',()=>{
    const counts=[0,0];
    for(let seed=0;seed<512;seed++) counts[sampleWeighted([0,1],1,item=>item===0?8:1,recommendationRandom(seed))[0]]++;
    expect(counts[0]).toBeGreaterThan(counts[1]*4);
    expect(counts[1]).toBeGreaterThan(0);
  });
});
