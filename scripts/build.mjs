import { cp, copyFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
else if (existsSync('.env')) process.loadEnvFile('.env');

const outputDirectory = 'dist';
const files = ['index.html', 'app.js', 'bootstrap.js', 'styles.css', 'sw.js', 'manifest.webmanifest'];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(`${outputDirectory}/business`, { recursive: true });
await cp('assets', `${outputDirectory}/assets`, { recursive: true });
await copyFile('business/business.css', `${outputDirectory}/business/business.css`);
await Promise.all(files.filter((file) => file !== 'app.js').map((file) => copyFile(file, `${outputDirectory}/${file}`)));

await build({
  entryPoints: {
    app: 'app.js',
    'business/business-view': 'business/business-view.js'
  },
  outdir: outputDirectory,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  legalComments: 'none',
  define: {
    __SUPABASE_URL__: JSON.stringify(process.env.SUPABASE_URL || ''),
    __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(process.env.SUPABASE_PUBLISHABLE_KEY || '')
  }
});

console.log(`PWA compilada en ${outputDirectory}/`);
console.log(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY
  ? 'Cliente Supabase configurado con variables públicas.'
  : 'Cliente Supabase compilado sin configurar.');
