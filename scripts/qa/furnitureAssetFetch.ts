// Serve Vite's emitted JSON asset URLs from source files in Node-only tests.
// Other requests keep the normal fetch behavior; the production loader is unchanged.
import {readFile} from 'node:fs/promises';
import {vi} from 'vitest';
const originalFetch=globalThis.fetch;
vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=String(input),match=url.match(/^\/src\/data\/furniture\/variants\/([a-z0-9-]+\.json)(?:\?.*)?$/);
 if(!match)return originalFetch(input,init);
 return new Response(await readFile(new URL(`../../src/data/furniture/variants/${match[1]}`,import.meta.url),'utf8'),{status:200,headers:{'Content-Type':'application/json'}});
});
