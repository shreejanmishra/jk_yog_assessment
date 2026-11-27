import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((mod) => `node:${mod}`),
]);

await build({
  configFile: false,
  root: rootDir,
  publicDir: false,
  logLevel: 'info',
  resolve: {
    alias: {
      '@domain': path.resolve(rootDir, 'src/domain'),
      '@contract': path.resolve(rootDir, 'src/contract'),
      '@server': path.resolve(rootDir, 'src/server'),
    },
  },
  build: {
    ssr: path.resolve(rootDir, 'src/server/vercel-entry.ts'),
    outDir: path.resolve(rootDir, 'api'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'node22',
    minify: false,
    rollupOptions: {
      external: (id) => {
        if (nodeBuiltins.has(id) || id.startsWith('node:')) {
          return true;
        }
        if (
          id.startsWith('.') ||
          id.startsWith('/') ||
          id.startsWith('\0') ||
          path.isAbsolute(id) ||
          /^[A-Za-z]:[\\/]/.test(id) ||
          id.startsWith('@domain/') ||
          id.startsWith('@contract/') ||
          id.startsWith('@server/')
        ) {
          return false;
        }
        return true;
      },
      output: {
        format: 'es',
        entryFileNames: 'index.js',
      },
    },
  },
});
