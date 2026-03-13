import { build, context } from 'esbuild';
import { resolve } from 'node:path';

const root = process.cwd();
const isWatch = process.argv.includes('--watch');

const baseConfig = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  jsxImportSource: 'react',
  sourcemap: false,
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
  }
};

const builds = [
  {
    entryPoints: [resolve(root, 'src/main.jsx')],
    outfile: resolve(root, 'app.bundle.js')
  },
  {
    entryPoints: [resolve(root, 'src/group-stats-main.jsx')],
    outfile: resolve(root, 'group-stats.bundle.js')
  }
];

async function runBuild() {
  await Promise.all(builds.map((config) => build({ ...baseConfig, ...config })));
}

async function runWatch() {
  const contexts = await Promise.all(
    builds.map((config) => context({ ...baseConfig, ...config }))
  );
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log('Watching browser bundles...');
}

if (isWatch) {
  await runWatch();
} else {
  await runBuild();
}
