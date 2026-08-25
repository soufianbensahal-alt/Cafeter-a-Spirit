import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
else if (existsSync('.env')) process.loadEnvFile('.env');

const outputDirectory = 'dist';
const assetUrl = (outputPath) => `/${outputPath.replace(`${outputDirectory}/`, '')}`;
const contentHash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 10);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(`${outputDirectory}/assets/js`, { recursive: true });
await mkdir(`${outputDirectory}/assets/css`, { recursive: true });
await mkdir(`${outputDirectory}/business`, { recursive: true });
await cp('assets', `${outputDirectory}/assets`, { recursive: true });
if (existsSync('public')) await cp('public', outputDirectory, { recursive: true });
await cp('manifest.webmanifest', `${outputDirectory}/manifest.webmanifest`);
await cp('business/manifest.webmanifest', `${outputDirectory}/business/manifest.webmanifest`);

const bundleResult = await build({
  entryPoints: { bootstrap: 'bootstrap.js' },
  outdir: `${outputDirectory}/assets/js`,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  legalComments: 'none',
  metafile: true,
  entryNames: '[name]-[hash]',
  chunkNames: 'chunks/[name]-[hash]',
  define: {
    __SUPABASE_URL__: JSON.stringify(process.env.SUPABASE_URL || ''),
    __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(process.env.SUPABASE_PUBLISHABLE_KEY || '')
  }
});

const jsOutputs = Object.entries(bundleResult.metafile.outputs)
  .filter(([file]) => file.endsWith('.js'));
const outputForEntry = (entryName) => {
  const match = jsOutputs.find(([, meta]) => meta.entryPoint?.endsWith(entryName));
  if (!match) throw new Error(`No se ha generado la entrada ${entryName}`);
  return assetUrl(match[0]);
};
const bootstrapUrl = outputForEntry('bootstrap.js');
const customerEntryUrl = outputForEntry('app.js');
const businessEntryUrl = outputForEntry('business/business-view.js');

const cssSources = {
  base: await readFile('base.css', 'utf8'),
  customer: await readFile('styles.css', 'utf8'),
  business: await readFile('business/business.css', 'utf8')
};
const cssUrls = {};
for (const [name, css] of Object.entries(cssSources)) {
  const filename = `${name}-${contentHash(css)}.css`;
  await writeFile(`${outputDirectory}/assets/css/${filename}`, css);
  cssUrls[name] = `/assets/css/${filename}`;
}

const startup = (await readFile('startup.js', 'utf8'))
  .replace('/business/business.css', cssUrls.business)
  .replace('/styles.css', cssUrls.customer);
await writeFile(`${outputDirectory}/startup.js`, startup);

const index = (await readFile('index.html', 'utf8'))
  .replace('/base.css', cssUrls.base)
  .replace('/bootstrap.js', bootstrapUrl);
await writeFile(`${outputDirectory}/index.html`, index);

const sharedRuntimeChunks = jsOutputs
  .map(([file]) => assetUrl(file))
  .filter((url) => ![bootstrapUrl, customerEntryUrl, businessEntryUrl].includes(url));
const customerStaticAssets = [
  '/assets/spirit-logo-header.png',
  '/assets/onboarding-coffee.jpg',
  '/assets/onboarding-order.jpg',
  '/assets/onboarding-spirit.jpg',
  '/assets/just-eat-logo.avif',
  '/assets/uber-eats-logo.png',
  '/assets/glovo-logo.svg'
];
const buildAssets = {
  shared: ['/', '/index.html', '/startup.js', bootstrapUrl, cssUrls.base],
  customer: [customerEntryUrl, cssUrls.customer, '/manifest.webmanifest', ...customerStaticAssets],
  business: [businessEntryUrl, cssUrls.business, '/business/manifest.webmanifest'],
  runtime: sharedRuntimeChunks
};
const worker = `self.__SPIRIT_BUILD_ASSETS__ = ${JSON.stringify({
  shared: buildAssets.shared,
  customer: buildAssets.customer,
  business: buildAssets.business,
  runtime: buildAssets.runtime
})};\n${await readFile('sw.js', 'utf8')}`;
await writeFile(`${outputDirectory}/sw.js`, worker);

console.log(`PWA compilada en ${outputDirectory}/ con recursos JS y CSS versionados.`);
console.log(`Cliente: ${customerEntryUrl} · Cafetería: ${businessEntryUrl}`);
console.log(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY
  ? 'Cliente Supabase configurado con variables públicas.'
  : 'Cliente Supabase compilado sin configurar.');
