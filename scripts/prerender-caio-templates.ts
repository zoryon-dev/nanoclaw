/**
 * Pre-render the 6 Caio template capas (slide 1) with Zoryon tokens applied.
 *
 * Output: groups/content-machine/template-previews/<slug>.png
 *
 * Run when:
 *  - Activating Caio for the first time
 *  - After editing any template-*.html
 *  - After updating design-tokens.css
 *
 * Usage:
 *   npx tsx scripts/prerender-caio-templates.ts
 *
 * Requires: playwright (devDep). Uses system chromium if
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is set, otherwise downloads one.
 */
import fs from 'fs';
import path from 'path';

import { chromium } from 'playwright';

const ZORYON_OVERRIDE = `
<style id="zoryon-override">
  :root {
    --accent: #837BF4 !important;
    --accent-alt: #FF7D3B !important;
    --color-primary: #837BF4 !important;
    --color-primary-light: #A9A3F7 !important;
    --color-primary-dark: #6A62D4 !important;
    --color-accent-orange: #FF7D3B !important;
    --color-accent-green: #2BD0A8 !important;
    --dark-bg: #141420 !important;
    --dark-bg2: #1C1C2E !important;
    --light-bg: #F2F2FA !important;
    --color-background: #F2F2FA !important;
    --color-surface: #FFFFFF !important;
    --color-text: #212130 !important;
    --color-text-inverse: #FFFFFF !important;
  }
</style>
`;

// Templates hardcode accent hex values directly in CSS rules (not always via vars).
// Replace each template's native accent with the closest Zoryon token so previews
// actually show the Zoryon palette, not the BrandsDecoded defaults.
const ACCENT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/#C8FF00/gi, '#2BD0A8'], // template-01 yellow-green → Zoryon accent-green
  [/#5B8CFF/gi, '#837BF4'], // template-05 blue → Zoryon primary
  [/#FF4500/gi, '#FF7D3B'], // template-01/02 orange-red → Zoryon accent-orange
  [/#E8421A/gi, '#FF7D3B'], // template-bd-01 orange → Zoryon accent-orange
  [/#E8C84A/gi, '#2BD0A8'], // template-03 gold → Zoryon accent-green
];

const TEMPLATES: Array<{ slug: string; file: string }> = [
  { slug: '01-editorial', file: 'template-01.html' },
  { slug: '02-photo', file: 'template-02.html' },
  { slug: '03-grid', file: 'template-03.html' },
  { slug: '04-clean', file: 'template-04.html' },
  { slug: '05-premium', file: 'template-05.html' },
  { slug: '06-bold', file: 'template-bd-01.html' },
];

const TEMPLATES_DIR = path.resolve('groups/content-machine/templates');
const OUT_DIR = path.resolve('groups/content-machine/template-previews');

async function main(): Promise<void> {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    throw new Error(`Templates directory not found: ${TEMPLATES_DIR}`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const launchOpts: Parameters<typeof chromium.launch>[0] = {};
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }

  const browser = await chromium.launch(launchOpts);

  try {
    for (const tpl of TEMPLATES) {
      const srcPath = path.join(TEMPLATES_DIR, tpl.file);
      if (!fs.existsSync(srcPath)) {
        console.warn(`✗ ${tpl.slug} — template missing: ${tpl.file}`);
        continue;
      }

      let html = fs.readFileSync(srcPath, 'utf8');
      for (const [pattern, replacement] of ACCENT_REPLACEMENTS) {
        html = html.replace(pattern, replacement);
      }
      const patched = html.includes('</head>')
        ? html.replace('</head>', `${ZORYON_OVERRIDE}</head>`)
        : ZORYON_OVERRIDE + html;

      const tmpPath = path.join(OUT_DIR, `.tmp-${tpl.slug}.html`);
      fs.writeFileSync(tmpPath, patched);

      const page = await browser.newPage({
        viewport: { width: 1200, height: 1400 },
      });

      try {
        await page.goto(`file://${tmpPath}`, { waitUntil: 'networkidle', timeout: 30_000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(1500);

        const firstSlide = page.locator('.slide').first();
        const count = await page.locator('.slide').count();
        if (count === 0) {
          console.warn(`✗ ${tpl.slug} — no .slide found in ${tpl.file}`);
          continue;
        }

        await firstSlide.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);

        const outPath = path.join(OUT_DIR, `${tpl.slug}.png`);
        await firstSlide.screenshot({ path: outPath });

        const sizeKb = Math.round(fs.statSync(outPath).size / 1024);
        console.log(`✓ ${tpl.slug} → ${outPath} (${sizeKb} KB)`);
      } finally {
        await page.close();
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\nDone. ${TEMPLATES.length} previews written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
