import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const isWindows = process.platform === 'win32';
const wrapper = resolve(process.cwd(), isWindows ? 'mvnw.cmd' : 'mvnw');
const result = isWindows
  ? spawnSync(
      'cmd.exe',
      ['/d', '/s', '/c', wrapper, ...process.argv.slice(2)],
      {
        stdio: 'inherit',
      },
    )
  : spawnSync('sh', [wrapper, ...process.argv.slice(2)], { stdio: 'inherit' });

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
