import {mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {build} from 'vite';
import {expect, it} from 'vitest';
import config from '../../vite.config';

it('emits compact, separately hashed model assets without changing any model values', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'roomfit-model-build-')));
  try {
    const directory = join(root, 'src/data/furniture/variants');
    await mkdir(directory, {recursive:true});
    const model = {variantId:'test-model', parts:[{vertices:[[0.123456789012345, 1, -2]], label:'한글 형상'}]};
    await writeFile(join(directory, 'test-model.json'), JSON.stringify(model, null, 2));
    await writeFile(join(root, 'index.html'), '<script type="module" src="/main.js"></script>');
    await writeFile(join(root, 'models.js'), 'export default import.meta.glob("./src/data/furniture/variants/*.json", {eager:true,query:"?url&no-inline",import:"default"});');
    await writeFile(join(root, 'main.js'), 'import urls from "./models.js";document.body.textContent=JSON.stringify(urls);new Worker(new URL("./worker.js",import.meta.url),{type:"module"});');
    await writeFile(join(root, 'worker.js'), 'import urls from "./models.js";postMessage(urls);');
    await build({...config, root, logLevel:'silent'});
    const files = await readdir(join(root, 'dist/assets'));
    expect(files.filter(file => file.endsWith('.json'))).toHaveLength(1);
    const asset = files.find(file => /^test-model-.*\.json$/.test(file));
    expect(asset).toBeDefined();
    const emitted = await readFile(join(root, 'dist/assets', asset!), 'utf8');
    expect(JSON.parse(emitted)).toEqual(model);
    expect(emitted).toBe(JSON.stringify(model));
    const worker = files.find(file => /^worker-.*\.js$/.test(file));
    const posted: unknown[] = [];
    const location = {href:`https://roomfit.test/assets/${worker}`};
    runInNewContext(await readFile(join(root, 'dist/assets', worker!), 'utf8'), {URL, location, self:{location}, postMessage:(value:unknown) => posted.push(value)});
    expect(posted).toHaveLength(1);
    expect(await readFile(join(directory, 'test-model.json'), 'utf8')).toContain('\n');
    await writeFile(join(directory, 'test-model.json'), JSON.stringify({...model, variantId:'changed'}));
    await build({...config, root, logLevel:'silent'});
    expect((await readdir(join(root, 'dist/assets'))).find(file => file.endsWith('.json'))).not.toBe(asset);
  } finally { await rm(root, {recursive:true, force:true}); }
}, 30_000);
