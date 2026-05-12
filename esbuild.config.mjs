import * as esbuild from 'esbuild';

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  loader: { '.md': 'text' },
  external: [],
  minify: false,
  sourcemap: false,
};

await Promise.all([
  esbuild.build({
    ...shared,
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.js',
  }),
  esbuild.build({
    ...shared,
    entryPoints: ['src/fix.ts'],
    outfile: 'dist/fix.js',
  }),
]);

console.log('Build complete → dist/index.js, dist/fix.js');
