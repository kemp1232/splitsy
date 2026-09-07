#!/usr/bin/env node
// Post-processes `dist/` (the Expo web export, `expo export -p web`) so it
// survives being deployed to Netlify.
//
// Metro's web export serves some third-party package assets (vendor icon
// fonts, expo-router's own nav icons) straight from their real resolved
// node_modules path, rather than copying them out to a short, content-
// hashed name the way first-party assets (assets/images/*) get — landing
// them under a deep `assets/node_modules/.pnpm/<pkg>@<version>/...` path.
//
// Every one of these silently 404s once deployed to Netlify via its
// dashboard drag-and-drop upload — with no build-time warning, and no
// single identifiable cause found after real live testing. In order:
//   1. Renaming the leading-dot `.pnpm` segment alone didn't fix it.
//   2. Additionally renaming every `node_modules`-named directory (a
//      *documented* Netlify CLI-deploy exclusion — see
//      https://github.com/netlify/cli/issues/205 — though the user's own
//      deploy method is the dashboard upload, a different code path with
//      no equivalent documentation found) still didn't fix it.
//   3. Additionally slugifying every remaining special character
//      (`@`, `+`, mid-name dots) out of every directory/file name in that
//      subtree — eliminating every plausible special-character culprit at
//      once — *still* didn't fix it, confirmed live via the exact path
//      from the build log matching the exact 404'd request URL.
//   4. Path depth (11 segments) and length (253 chars) don't look
//      abnormal either — no single further "shape" theory left to try
//      blind, and no Netlify dashboard/API access available from here to
//      inspect the actual uploaded file list directly.
//
// Rather than keep chasing Netlify's exact undocumented rule, this
// sidesteps the whole class of problem: every file under the vendor tree
// is copied out flat to `dist/vendor-assets/<original-basename>` (already
// content-hashed by Metro, so collision-free in practice — first-party
// assets right next to these, at a similarly shallow depth, are already
// confirmed working on this exact deploy) and every reference to the old
// deep path is rewritten to the new flat one. The original deep tree is
// then deleted outright, not just left unreferenced — on the chance that
// its mere *presence* (a very deep, oddly-shaped path), not selective
// exclusion of it, is what's actually derailing the upload, which would
// explain why every narrower fix tried so far made no difference.
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';

const DIST_DIR = 'dist';
const VENDOR_ROOTS = ['dist/assets/node_modules']; // the literal export path — renamed only in the rewritten *references*, not on disk, so this must stay the pre-rename name
const FLATTEN_DIR = 'dist/vendor-assets';

// This app's own web build is a client-side-routed SPA — Expo's export has
// no per-route HTML file, only one root index.html, so any host serving
// dist/ as plain static files 404s on a deep-link or a refresh of any
// non-root route (e.g. /settings). `web-serve-headers.json` already
// carries the equivalent rewrite for local `pnpm web:preview`/`serve`, and
// a real Vercel deploy would get this from vercel.json's own rewrites —
// but the user's actual deploy target is Netlify via manual dashboard
// upload of this dist/ folder, which only respects a `_redirects` file
// (Netlify's own, unrelated-to-Vercel config format) placed inside the
// uploaded folder itself; a repo-root netlify.toml is never read for a
// drag-and-drop upload, only for Netlify's own git-connected CI builds.
// `/* /index.html 200` is Netlify's documented catch-all SPA fallback
// syntax. Plain top-level file, no leading dot, not nested under
// node_modules — none of the deploy-exclusion issues this same script
// spent three rounds chasing for the vendor assets apply to it.
writeFileSync(join(DIST_DIR, '_redirects'), '/*    /index.html   200\n');
console.log(`Wrote ${DIST_DIR}/_redirects (Netlify SPA fallback).`);

function listFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listFiles(full, found);
    else found.push(full);
  }
  return found;
}

const renameLog = []; // { from: 'old relative path (as it appears in a bundle)', to: 'new relative path' }
const usedNames = new Set();

for (const root of VENDOR_ROOTS) {
  let files;
  try {
    files = listFiles(root, []);
  } catch {
    continue; // this export doesn't have that root at all — nothing to flatten
  }
  for (const file of files) {
    const base = file.slice(file.lastIndexOf('/') + 1);
    let target = base;
    let n = 2;
    while (usedNames.has(target)) {
      const dot = base.lastIndexOf('.');
      target = dot > 0 ? `${base.slice(0, dot)}-${n}${base.slice(dot)}` : `${base}-${n}`;
      n++;
    }
    usedNames.add(target);

    const destPath = join(FLATTEN_DIR, target);
    mkdirSync(dirname(destPath), { recursive: true });
    copyFileSync(file, destPath);

    const oldRel = relative(DIST_DIR, file); // e.g. assets/node_modules/.pnpm/.../Fonts/Feather.ca4b...ttf
    const newRel = relative(DIST_DIR, destPath); // e.g. vendor-assets/Feather.ca4b...ttf
    renameLog.push({ from: oldRel, to: newRel });
    console.log(`Copied ${oldRel} -> ${newRel}`);
  }
}

if (renameLog.length === 0) {
  console.log(`No files found under ${VENDOR_ROOTS.join(', ')} — nothing to flatten.`);
  process.exit(0);
}

for (const root of VENDOR_ROOTS) {
  rmSync(root, { recursive: true, force: true });
  console.log(`Deleted ${root} (flattened copies already made above).`);
}

// Longest `from` first, so no rewrite partially matches inside another
// (none of these should overlap as substrings of each other in practice,
// but cheap insurance).
renameLog.sort((a, b) => b.from.length - a.from.length);
const bundleFiles = listFiles(DIST_DIR).filter((f) => /\.(js|html)$/.test(f));
let rewrittenCount = 0;
for (const file of bundleFiles) {
  let contents = readFileSync(file, 'utf8');
  let changed = false;
  for (const { from, to } of renameLog) {
    if (!contents.includes(from)) continue;
    contents = contents.split(from).join(to);
    changed = true;
  }
  if (changed) {
    writeFileSync(file, contents);
    rewrittenCount++;
  }
}
console.log(`Rewrote flattened path references in ${rewrittenCount} file(s).`);
