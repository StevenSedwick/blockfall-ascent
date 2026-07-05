import { spawnSync } from 'node:child_process';

if (process.env.SKIP_PATCH_PACKAGE === '1') {
  console.log('postinstall: SKIP_PATCH_PACKAGE=1, skipping patch-package');
  process.exit(0);
}

const result = spawnSync('npx', ['patch-package'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
