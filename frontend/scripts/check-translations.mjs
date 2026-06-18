#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { glob } from 'glob';

const ROOT = resolve(import.meta.dirname, '..');
const LOCALE_DIR = join(ROOT, 'messages');
const SRC_DIRS = ['app', 'components', 'hooks', 'lib', 'store'];
const LOCALES = ['ru', 'en', 'ua'];

function loadMessages(locale) {
  const path = join(LOCALE_DIR, locale, 'common.json');
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function flatten(obj, prefix = '') {
  let result = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null) {
      Object.assign(result, flatten(v, key));
    } else {
      result[key] = v;
    }
  }
  return result;
}

function extractKeys(content, filePath) {
  const keys = new Set();
  let currentNs = 'common';

  // useTranslations('namespace')
  const nsMatch = content.match(/useTranslations\(\s*['"]([^'"]+)['"]\s*\)/g);
  if (nsMatch) {
    // Track namespace changes per t() call — handled below per-token
  }

  // Find all useTranslations calls and map their scope
  const nsMap = new Map();
  const nsRegex = /useTranslations\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = nsRegex.exec(content)) !== null) {
    const ns = match[1];
    // Find what follows — usually destructured t
    const after = content.slice(nsRegex.lastIndex).match(/(?:\s*\))?\s*[;,\n]/);
    // Track namespace
    if (!nsMap.has(ns)) nsMap.set(ns, 0);
    nsMap.set(ns, nsMap.get(ns) + 1);
  }

  // Extract all t('key') and t("key") calls
  const tRegex = /([\w$]+)\s*\(\s*['"]([^'"]+)['"]/g;
  while ((match = tRegex.exec(content)) !== null) {
    const funcName = match[1];
    const key = match[2];
    // Check if this is actually a t() call by looking at context
    const before = content.slice(Math.max(0, match.index - 20), match.index);
    if (funcName === 't' || /[^a-zA-Z]/g.test(funcName) || funcName.length <= 1) {
      // Skip non-translation function calls
      continue;
    }
    // Only process if called via a variable named 't' or a namespace function
    if (funcName === 't') {
      keys.add(key);
    }
  }

  // Also find t('key') directly — the variable is usually named 't'
  const directRegex = /(?<![$\w])t\s*\(\s*['"]([^'"]+)['"]\s*(?:,|\))/g;
  while ((match = directRegex.exec(content)) !== null) {
    keys.add(match[1]);
  }

  // Find template literal keys: t(`key`)
  const templateRegex = /(?<![$\w])t\s*\(\s*`([^`]+)`/g;
  while ((match = templateRegex.exec(content)) !== null) {
    keys.add(match[1].replace(/\$\{[^}]+\}/g, '*'));
  }

  return { keys, namespaces: [...nsMap.keys()] };
}

function resolveFullKeys(keys, namespaces, fileNs) {
  const resolved = new Set();
  for (const key of keys) {
    if (key.includes('.')) {
      // Already a dotted path — resolve from root
      resolved.add(key);
    } else {
      // Prepend each active namespace
      for (const ns of namespaces.length ? namespaces : [fileNs]) {
        resolved.add(`${ns}.${key}`);
      }
    }
    // Also try root-level (common namespace by default)
    if (!key.startsWith('common.') && !key.includes('.')) {
      resolved.add(`common.${key}`);
    }
  }
  return resolved;
}

function scanFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const fileRel = filePath.replace(ROOT, '');
  const { keys, namespaces } = extractKeys(content, filePath);

  // Determine the file's default namespace from path convention
  let fileNs = 'common';
  if (fileRel.includes('/admin/')) fileNs = 'admin';
  // Most files use 'common' by default

  const resolved = resolveFullKeys(keys, namespaces, fileNs);
  return resolved;
}

async function main() {
  // Find all ts/tsx files in source dirs
  const patterns = SRC_DIRS.map(d => join(ROOT, d, '**/*.{ts,tsx}'));
  const files = (await Promise.all(patterns.map(p => glob(p)))).flat();

  // Load all locale messages
  const messages = {};
  for (const locale of LOCALES) {
    messages[locale] = flatten(loadMessages(locale));
  }
  const allKeys = Object.keys(messages['ru']);

  // Scan all source files
  const usedKeys = new Set();
  for (const file of files) {
    const keys = scanFile(file);
    for (const k of keys) usedKeys.add(k);
  }

  // Report
  let exitCode = 0;

  console.log(`\nScanned ${files.length} files, found ${usedKeys.size} unique translation keys in use.\n`);

  // Missing from locale files
  for (const locale of LOCALES) {
    const missing = [...usedKeys].filter(k => !(k in messages[locale]));
    if (missing.length > 0) {
      console.log(`❌ ${locale}: ${missing.length} keys missing:`);
      for (const k of missing.slice(0, 20)) {
        console.log(`   - ${k}`);
      }
      if (missing.length > 20) console.log(`   ... and ${missing.length - 20} more`);
      exitCode = 1;
    } else {
      console.log(`✅ ${locale}: all keys present`);
    }
  }

  // Unused keys in locale files
  const unused = allKeys.filter(k => !usedKeys.has(k) && !k.startsWith('pages.'));
  if (unused.length > 0) {
    console.log(`\nℹ️  ${unused.length} keys in locale files are not used in code (excluding pages.*):`);
    for (const k of unused.slice(0, 20)) {
      console.log(`   - ${k}`);
    }
    if (unused.length > 20) console.log(`   ... and ${unused.length - 20} more`);
  }

  process.exit(exitCode);
}

main().catch(console.error);
