import { readdirSync, realpathSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES = ['@nestjs/common', '@nestjs/microservices'];
const root = process.cwd();

const apps = readdirSync(join(root, 'apps'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(root, 'apps', entry.name))
  .filter((dir) => existsSync(join(dir, 'node_modules', '@nestjs', 'core')));

let failures = 0;
for (const app of apps) {
  const core = realpathSync(join(app, 'node_modules', '@nestjs', 'core'));
  const coreSiblings = join(core, '..');
  for (const pkg of PACKAGES) {
    const appCopy = join(app, 'node_modules', pkg);
    const coreCopy = join(coreSiblings, pkg.split('/')[1]);
    if (!existsSync(appCopy) || !existsSync(coreCopy)) continue;
    if (realpathSync(appCopy) !== realpathSync(coreCopy)) {
      failures += 1;
      console.error(
        `✖ ${app}: ${pkg} differs from the copy @nestjs/core loads`,
      );
      console.error(`    app : ${realpathSync(appCopy)}`);
      console.error(`    core: ${realpathSync(coreCopy)}`);
    }
  }
}

if (failures > 0) {
  process.exit(1);
}
console.log(
  `✔ ${apps.length} apps share one instance of ${PACKAGES.join(', ')}`,
);
