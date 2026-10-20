// Refreshes the Steam review score shown under each released game in the
// Games section. Reads the main review row from the Steam store page (the
// same row a visitor sees), not the appreviews API, whose totals differ.
//
// Usage: node .github/scripts/refresh-steam-reviews.mjs [--dry-run]

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const POSTS_DIR = '_posts';
const dryRun = process.argv.includes('--dry-run');

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchStorePage(appid) {
  const url = `https://store.steampowered.com/app/${appid}/?l=english&cc=gb`;
  const res = await fetch(url, {
    headers: {
      Cookie: 'birthtime=0; lastagecheckage=1-0-1990',
      'Accept-Language': 'en-GB,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (compatible; PawsmonautGames-review-refresh)',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return res.text();
}

// Returns { summary: 'Very Positive', percent: 94, total: '1,840' } or null.
function parseReviews(html) {
  // The headline row Steam shows ("All Reviews" or "English Reviews") is the
  // one carrying the schema.org aggregateRating; the "Recent Reviews" row
  // never does.
  const rows = html.match(/<a\b[^>]*class="user_reviews_summary_row"[^>]*>[\s\S]*?<\/a>/g) || [];
  const row = rows.find((r) => /itemprop="aggregateRating"/.test(r))
    || rows.find((r) => /All Reviews:/.test(r));
  if (!row) return null;

  const label = row.match(/<span class="game_review_summary[^"]*"[^>]*>([^<]+)<\/span>/);
  // Tooltip, e.g. "94% of the 1,840 user reviews for this game are positive."
  const stats = row.match(/(\d+)% of the ([\d,]+) user reviews/);
  if (!label || !stats) return null;

  return { summary: decodeEntities(label[1]), percent: Number(stats[1]), total: stats[2] };
}

// Replaces the value of an existing top-level front matter field, keeping the
// file's line endings and everything else byte-for-byte.
function setField(frontMatter, key, value) {
  const re = new RegExp(`^(${key}:[ \\t]*)([^\\r\\n]*)`, 'm');
  if (!re.test(frontMatter)) return { text: frontMatter, found: false };
  return { text: frontMatter.replace(re, (_, prefix) => prefix + value), found: true };
}

async function main() {
  const files = (await readdir(POSTS_DIR)).filter((f) => /\.(md|markdown)$/.test(f)).sort();
  let changed = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(POSTS_DIR, file);
    const original = await readFile(filePath, 'utf8');
    const fm = original.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
    if (!fm) continue;
    const appid = fm[0].match(/^steam-appid:[ \t]*["']?(\d+)/m)?.[1];
    if (!appid) continue;

    let reviews;
    try {
      reviews = parseReviews(await fetchStorePage(appid));
    } catch (err) {
      console.error(`${file} (app ${appid}): ${err.message}`);
      failed++;
      continue;
    }
    if (!reviews) {
      console.warn(`${file} (app ${appid}): no review score on the store page yet; left as is`);
      continue;
    }

    const summary = `${reviews.percent}% of ${reviews.total} Steam reviews`;
    let front = fm[0];
    let found = true;
    for (const [key, value] of [['review-score', reviews.summary], ['review-summary', summary]]) {
      const result = setField(front, key, value);
      front = result.text;
      found &&= result.found;
    }
    if (!found) {
      console.warn(`${file} (app ${appid}): missing review-score or review-summary field; left as is`);
      continue;
    }

    const updated = front + original.slice(fm[0].length);
    console.log(`${file} (app ${appid}): ${reviews.summary} · ${summary}${updated === original ? ' (unchanged)' : ''}`);
    if (updated !== original) {
      changed++;
      if (!dryRun) await writeFile(filePath, updated, 'utf8');
    }
  }

  console.log(`${changed} post(s) ${dryRun ? 'would change' : 'changed'}.`);
  if (failed) process.exitCode = 1;
}

await main();
