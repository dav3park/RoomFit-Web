/** Request-local randomness keeps a seed reproducible across Worker runs. */
export function recommendationRandom(seed: number) {
  let state=seed>>>0;
  return () => {
    state=(state+0x6D2B79F5)>>>0;
    let value=Math.imul(state^(state>>>15),state|1);
    value^=value+Math.imul(value^(value>>>7),value|61);
    return ((value^(value>>>14))>>>0)/4294967296;
  };
}

/** Weighted sampling without replacement: every eligible entry can be explored. */
export function sampleWeighted<T>(items:readonly T[],count:number,weight:(item:T)=>number,random:()=>number):T[] {
  return items.map(item=>({item,key:-Math.log(1-random())/Math.max(.001,weight(item))}))
    .sort((a,b)=>a.key-b.key).slice(0,count).map(entry=>entry.item);
}
