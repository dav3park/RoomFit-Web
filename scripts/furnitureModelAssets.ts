import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {createHash} from 'node:crypto';
import type {Plugin} from 'vite';

/** Compact model JSON before hashing; source geometry and development files stay intact. */
export function furnitureModelAssets(): Plugin {
  let base = '/';
  let assetsDir = 'assets';
  return {
    name:'roomfit-furniture-model-assets',
    enforce:'pre',
    apply:'build',
    configResolved(config) { base = config.base; assetsDir = config.build.assetsDir; },
    async load(id) {
      const [file, query] = id.split('?');
      if (!/\/data\/furniture\/variants\/[^/]+\.json$/.test(file) || !new URLSearchParams(query).has('url')) return;
      const source = JSON.stringify(JSON.parse(await readFile(file, 'utf8')));
      const hash = createHash('sha256').update(source).digest('hex').slice(0, 12);
      const fileName = `${assetsDir}/${basename(file, '.json')}-${hash}.json`;
      this.emitFile({type:'asset', fileName, source});
      // RoomFit uses a root-based Vite base; literals also work in classic Workers.
      return `export default ${JSON.stringify(`${base}${fileName}`)};`;
    },
  };
}
