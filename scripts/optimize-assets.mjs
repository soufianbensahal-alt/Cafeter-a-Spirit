import { rename, stat } from 'node:fs/promises';
import sharp from 'sharp';

const jobs = [
  ...['coffee', 'order', 'spirit'].map((name) => ({
    file: `assets/onboarding-${name}.jpg`,
    transform: (image) => image.jpeg({ quality: 82, progressive: true, mozjpeg: true })
  })),
  {
    file: 'assets/uber-eats-logo.png',
    transform: (image) => image.resize({ width: 170, height: 140, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true })
  },
  {
    file: 'public/email/paw-pattern.png',
    transform: (image) => image.resize({ width: 1200, withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true, quality: 90 })
  },
  {
    file: 'public/email/logo-white.png',
    transform: (image) => image.png({ compressionLevel: 9, palette: true, quality: 100 })
  }
];

for (const { file, transform } of jobs) {
  const temporaryFile = `${file}.optimized`;
  const before = (await stat(file)).size;
  await transform(sharp(file, { failOn: 'error' })).toFile(temporaryFile);
  const after = (await stat(temporaryFile)).size;
  if (after >= before) {
    await import('node:fs/promises').then(({ rm }) => rm(temporaryFile));
    console.log(`${file}: ya estaba optimizado (${before} bytes)`);
    continue;
  }
  await rename(temporaryFile, file);
  console.log(`${file}: ${before} → ${after} bytes`);
}
