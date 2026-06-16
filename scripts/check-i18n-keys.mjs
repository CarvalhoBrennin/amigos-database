import fs from 'node:fs';
import path from 'node:path';

const LOCALES_DIR = path.join(process.cwd(), 'src', 'locales');
const BASE_LOCALE = 'pt';
const CORRUPTION_PATTERN = /\?{3,}/;

function flattenKeys(obj, prefix = '') {
    return Object.entries(obj).flatMap(([key, value]) => {
        const next = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return flattenKeys(value, next);
        }
        return [[next, value]];
    });
}

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const localeDirs = fs
    .readdirSync(LOCALES_DIR)
    .filter((entry) => fs.statSync(path.join(LOCALES_DIR, entry)).isDirectory());

if (!localeDirs.includes(BASE_LOCALE)) {
    console.error(`[i18n-check] Base locale "${BASE_LOCALE}" not found in ${LOCALES_DIR}`);
    process.exit(1);
}

const baseFile = path.join(LOCALES_DIR, BASE_LOCALE, 'translation.json');
const baseEntries = flattenKeys(loadJson(baseFile));
const baseKeys = new Set(baseEntries.map(([key]) => key));

const violations = [];
const corruptionViolations = [];

for (const locale of localeDirs) {
    if (locale === BASE_LOCALE) {
        continue;
    }

    const localeFile = path.join(LOCALES_DIR, locale, 'translation.json');
    const localeEntries = flattenKeys(loadJson(localeFile));
    const localeKeys = new Set(localeEntries.map(([key]) => key));

    const missing = [...baseKeys].filter((key) => !localeKeys.has(key));
    const extra = [...localeKeys].filter((key) => !baseKeys.has(key));

    if (missing.length || extra.length) {
        violations.push({ locale, missing, extra });
    }

    const corrupted = localeEntries
        .filter(([, value]) => typeof value === 'string' && CORRUPTION_PATTERN.test(value))
        .map(([key]) => key);

    if (corrupted.length) {
        corruptionViolations.push({ locale, corrupted });
    }
}

if (violations.length > 0) {
    for (const { locale, missing, extra } of violations) {
        if (missing.length) {
            console.error(`[i18n-check] ${locale} missing keys (${missing.length}): ${missing.join(', ')}`);
        }
        if (extra.length) {
            console.error(`[i18n-check] ${locale} extra keys (${extra.length}): ${extra.join(', ')}`);
        }
    }
    process.exit(1);
}

if (corruptionViolations.length > 0) {
    for (const { locale, corrupted } of corruptionViolations) {
        console.error(`[i18n-check] ${locale} corrupted strings (${corrupted.length}): ${corrupted.join(', ')}`);
    }
    process.exit(1);
}

console.log(`[i18n-check] OK. ${localeDirs.length} locales are in sync with "${BASE_LOCALE}".`);
