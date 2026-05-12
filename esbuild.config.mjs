import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  loader: {
    '.md': 'text',
  },
  // Bundle everything — Actions runtime has no node_modules
  external: [],
  minify: false,
  sourcemap: false,
});

console.log('Build complete → dist/index.js');
