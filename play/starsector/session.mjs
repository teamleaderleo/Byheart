import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FilePreflightRuntimeTransport, PreflightGameSurface } from '../../dist/src/adapters/preflight.js';
import { ReplayEngine } from '../../dist/src/replay.js';
import { MemoryEvidenceSink } from '../../dist/src/evidence.js';

const [runDirectory, command = 'observe'] = process.argv.slice(2);
if (!runDirectory || !['observe', 'pause', 'unpause'].includes(command)) {
  throw new Error('Usage: node play/starsector/session.mjs RUN_DIRECTORY observe|pause|unpause');
}
const surface = new PreflightGameSurface({ transport: new FilePreflightRuntimeTransport({ runDirectory }) });
if (command === 'observe') {
  console.log(JSON.stringify(await surface.observe()));
} else {
  const capability = {
    format: 'byheart-capability/v1', id: `starsector.${command}`, name: `Campaign ${command}`, version: 1,
    description: 'Set campaign pause state through the reviewed Preflight input boundary; reject dialogs and menus.',
    target: { adapter: 'preflight-starsector', entrypoint: 'preflight://starsector/runtime' },
    inputs: {}, outputs: {},
    steps: [{ id: command, action: { kind: 'semantic', name: `campaign.${command}` },
      before: [{ kind: 'semantic', name: 'preflight.state', args: { state: 'campaign-ready' } }] }],
    success: [{ kind: 'semantic', name: 'preflight.state', args: { state: 'campaign-ready' } }],
    policy: { allowedAdapters: ['preflight-starsector'], allowedActions: ['semantic'],
      allowedEntrypoints: ['preflight://starsector/runtime'], consequentialPolicy: 'block' },
  };
  const evidence = new MemoryEvidenceSink();
  const result = await new ReplayEngine(surface, evidence).run(capability, {});
  const directory = resolve(runDirectory, 'byheart', `${Date.now()}-${command}`);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'capability.json'), JSON.stringify(capability, null, 2));
  await writeFile(resolve(directory, 'result.json'), JSON.stringify(result, null, 2));
  await writeFile(resolve(directory, 'events.jsonl'), evidence.jsonl());
  console.log(JSON.stringify({ result, directory }));
  if (result.status !== 'success') process.exitCode = 1;
}
