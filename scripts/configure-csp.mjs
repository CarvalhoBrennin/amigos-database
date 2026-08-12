import { readFile, writeFile } from 'node:fs/promises';

const HTTPS_PLACEHOLDER = 'https://api.example.invalid';
const WSS_PLACEHOLDER = 'wss://api.example.invalid';
const targets = ['vercel.json', 'public/_headers'];
const checkOnly = process.argv.includes('--check');
const rawOrigin = process.env.CSP_API_ORIGIN
    ?? process.argv.find((argument) => argument.startsWith('--api-origin='))?.slice('--api-origin='.length);

if (checkOnly) {
    let expectedPair;
    for (const target of targets) {
        const content = await readFile(target, 'utf8');
        const connectSources = /connect-src\s+([^;]+)/.exec(content)?.[1]?.split(/\s+/) ?? [];
        if (connectSources.includes('*') || connectSources.includes('https:') || connectSources.includes('wss:')) {
            throw new Error(`${target} contains a wildcard connect-src source`);
        }
        const wssOrigins = connectSources.filter((source) => source.startsWith('wss://'));
        if (wssOrigins.length !== 1) {
            throw new Error(`${target} must contain exactly one explicit WSS API origin`);
        }
        const httpsOrigin = wssOrigins[0].replace(/^wss:/, 'https:');
        if (!connectSources.includes(httpsOrigin)) {
            throw new Error(`${target} does not contain the HTTPS pair for its WSS API origin`);
        }
        const pair = `${httpsOrigin}|${wssOrigins[0]}`;
        if (expectedPair && expectedPair !== pair) {
            throw new Error('CSP API origins differ between deployment header files');
        }
        expectedPair = pair;
    }
    if (rawOrigin && expectedPair !== createOriginPair(rawOrigin).join('|')) {
        throw new Error('Configured CSP origins do not match CSP_API_ORIGIN');
    }
    process.stdout.write(`CSP API origins are explicit and consistent: ${expectedPair}.\n`);
    process.exit(0);
}

if (!rawOrigin) {
    throw new Error('Provide CSP_API_ORIGIN or --api-origin=https://api.example.com');
}

const [httpsOrigin, wssOrigin] = createOriginPair(rawOrigin);

for (const target of targets) {
    const content = await readFile(target, 'utf8');
    if (!content.includes(HTTPS_PLACEHOLDER) || !content.includes(WSS_PLACEHOLDER)) {
        throw new Error(`${target} was already configured or has unexpected CSP content`);
    }
    const configured = content
        .replaceAll(HTTPS_PLACEHOLDER, httpsOrigin)
        .replaceAll(WSS_PLACEHOLDER, wssOrigin);
    await writeFile(target, configured, 'utf8');
}

process.stdout.write(`CSP configured for ${httpsOrigin} and ${wssOrigin}.\n`);

function createOriginPair(origin) {
    const apiUrl = new URL(origin);
    if (apiUrl.protocol !== 'https:' || apiUrl.username || apiUrl.password
        || apiUrl.pathname !== '/' || apiUrl.search || apiUrl.hash) {
        throw new Error('The API origin must be an HTTPS origin without credentials, path, query, or fragment');
    }
    const httpsOrigin = apiUrl.origin;
    apiUrl.protocol = 'wss:';
    return [httpsOrigin, apiUrl.origin];
}
