import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

const repoRoot = path.resolve(__dirname, '..');
const repoSrc = path.resolve(repoRoot, 'src');
const repoModules = path.resolve(repoRoot, 'node_modules');
const mock = (name: string) => path.resolve(__dirname, 'src/mock', name);

/**
 * The Rabby extension imports SVGs as React components via
 * `import { ReactComponent as X } from './x.svg'` (the CRA/webpack style).
 * This plugin turns any resolved `.svg` file into a JS module exposing both
 * a `ReactComponent` named export and a default export, inlining the markup
 * so the real icons render in the preview.
 */
function svgAsReactComponent(): Plugin {
  return {
    name: 'svg-as-react-component',
    enforce: 'pre',
    load(id) {
      const file = id.split('?')[0];
      if (!file.endsWith('.svg')) return null;
      const raw = fs
        .readFileSync(file, 'utf-8')
        .replace(/<\?xml[\s\S]*?\?>/, '')
        .trim();
      return `import React from 'react';
const markup = ${JSON.stringify(raw)};
export const ReactComponent = (props) =>
  React.createElement('span', {
    ...props,
    style: { display: 'inline-flex', lineHeight: 0, ...(props && props.style) },
    dangerouslySetInnerHTML: { __html: markup },
  });
export default ReactComponent;`;
    },
  };
}

export default defineConfig({
  root: __dirname,
  plugins: [svgAsReactComponent(), react()],
  server: {
    host: true,
    port: Number(process.env.PORT) || 3000,
    fs: {
      // Allow importing real source + node_modules from the repo root.
      allow: [repoRoot],
    },
  },
  resolve: {
    // Order matters: specific mock aliases must precede the generic `@`/`ui`
    // fallbacks so the heavy background/wallet modules never get pulled in.
    alias: [
      { find: '@/ui/utils', replacement: mock('wallet.tsx') },
      {
        find: '@/ui/component/ThemeMode/ThemeIcon',
        replacement: mock('ThemeIcon.tsx'),
      },
      { find: '@/ui/component', replacement: mock('component.tsx') },
      {
        find: '@/ui/hooks/backgroundState/useAccount',
        replacement: mock('useAccount.tsx'),
      },
      {
        find: '../components/ProjectEditor',
        replacement: mock('ProjectEditor.tsx'),
      },
      {
        find: '../components/DelegationSettings',
        replacement: mock('DelegationSettings.tsx'),
      },
      {
        find: '../hooks/useAaveHealthFactor',
        replacement: mock('useAaveHealthFactor.tsx'),
      },
      // Reuse the extension's installed React/antd so there is a single copy.
      { find: /^react$/, replacement: path.resolve(repoModules, 'react') },
      {
        find: /^react-dom$/,
        replacement: path.resolve(repoModules, 'react-dom'),
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: path.resolve(repoModules, 'react/jsx-runtime.js'),
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: path.resolve(repoModules, 'react/jsx-dev-runtime.js'),
      },
      { find: /^antd$/, replacement: path.resolve(repoModules, 'antd') },
      { find: /^antd\/(.*)$/, replacement: path.resolve(repoModules, 'antd/$1') },
      // Generic path aliases mirroring the repo's webpack/tsconfig setup.
      { find: /^@\/(.*)$/, replacement: `${repoSrc}/$1` },
      { find: /^ui\/(.*)$/, replacement: `${repoSrc}/ui/$1` },
    ],
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['antd'],
  },
});
