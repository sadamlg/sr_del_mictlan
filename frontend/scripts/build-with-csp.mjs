import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const projectRoot = process.cwd();
const repositoryRoot = resolve(projectRoot, '..');
const generatedHashesPath = resolve(projectRoot, '.generated/csp-hashes.js');
const nextCliPath = resolve(projectRoot, 'node_modules/next/dist/bin/next');
const allowedInlineStyleAttributes = new Set([
  'color:transparent',
  'font-family:system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji";height:100vh;display:flex;align-items:center;justify-content:center',
  'margin-top:-32px;max-width:325px;padding:32px 28px;text-align:left',
  'margin-bottom:24px',
  'font-size:24px;font-weight:500;letter-spacing:-0.02em;line-height:32px;margin:0 0 12px 0;color:var(--next-error-title)',
  'font-size:14px;font-weight:400;line-height:21px;margin:0 0 20px 0;color:var(--next-error-message)',
  'margin:0',
  'display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 12px;font-size:14px;font-weight:500;line-height:20px;border-radius:6px;cursor:pointer;color:var(--next-error-btn-text);background:var(--next-error-btn-bg);border:var(--next-error-btn-border)',
  'font-family:system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji";height:100vh;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center',
  'display:inline-block;margin:0 20px 0 0;padding:0 23px 0 0;font-size:24px;font-weight:500;vertical-align:top;line-height:49px',
  'display:inline-block',
  'font-size:14px;font-weight:400;line-height:49px;margin:0',
]);

function runGit(...args) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 ? result.stdout : '';
}

function createBuildId() {
  const commit = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GITHUB_SHA || runGit('rev-parse', 'HEAD').trim();
  const workingDiff = runGit('diff', '--binary', 'HEAD');
  const untrackedFiles = runGit('ls-files', '--others', '--exclude-standard')
    .split('\n')
    .filter(Boolean)
    .map((path) => `${path}\0${readFileSync(resolve(repositoryRoot, path))}`)
    .join('\0');
  const buildInputs = [
    'INTERNAL_API_URL',
    'MEDIA_BASE_URL',
    'NEXT_PUBLIC_API_URL',
    'NEXT_PUBLIC_API_PROXY_PATH',
    'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    'RAILWAY_ENVIRONMENT_ID',
  ].map((name) => `${name}=${process.env[name] || ''}`).join('\0');
  const sourceDigest = createHash('sha256')
    .update(workingDiff)
    .update(untrackedFiles)
    .update(buildInputs)
    .digest('hex')
    .slice(0, 12);
  return `mictlan-${commit.slice(0, 32) || randomUUID()}-${sourceDigest}`;
}

function collectInlineHashes(directory) {
  const htmlFiles = [];
  const visit = (currentPath) => {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = join(currentPath, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile() && entry.name.endsWith('.html')) htmlFiles.push(entryPath);
    }
  };

  visit(directory);
  const scriptHashes = new Set();
  const styleAttributeHashes = new Set();

  for (const htmlPath of htmlFiles) {
    const html = readFileSync(htmlPath, 'utf8');
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const [, attributes, body] = match;
      if (/\bsrc\s*=/.test(attributes)) continue;
      const type = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.trim().toLowerCase();
      const executableType = !type || type === 'module' || /^(text|application)\/(javascript|ecmascript)(?:\s*;|$)/.test(type);
      if (!executableType) continue;
      const digest = createHash('sha256').update(body, 'utf8').digest('base64');
      scriptHashes.add(`sha256-${digest}`);
    }

    for (const match of html.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      const style = decodeHtmlAttribute(match[1] ?? match[2]);
      if (!allowedInlineStyleAttributes.has(style)) {
        throw new Error(`Unapproved inline style attribute in ${htmlPath}: ${style}`);
      }
      const digest = createHash('sha256').update(style, 'utf8').digest('base64');
      styleAttributeHashes.add(`sha256-${digest}`);
    }
  }

  if (!htmlFiles.length || !scriptHashes.size) {
    throw new Error('Could not find prerendered HTML inline scripts to authorize in the CSP.');
  }
  return {
    scripts: [...scriptHashes].sort(),
    styleAttributes: [...styleAttributeHashes].sort(),
  };
}

function writeGeneratedHashes(hashes) {
  mkdirSync(resolve(projectRoot, '.generated'), { recursive: true });
  writeFileSync(generatedHashesPath, `export default ${JSON.stringify(hashes)};\n`);
}

function decodeHtmlAttribute(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function runNextBuild(buildId) {
  const result = spawnSync(process.execPath, [nextCliPath, 'build'], {
    cwd: projectRoot,
    env: { ...process.env, NEXT_BUILD_ID: buildId },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

const serverOutputDirectory = resolve(projectRoot, '.next/server');
const buildId = createBuildId();
writeGeneratedHashes({ scripts: [], styleAttributes: [] });
runNextBuild(buildId);

let hashes = collectInlineHashes(serverOutputDirectory);
let verified = false;

for (let attempt = 1; attempt <= 3; attempt += 1) {
  writeGeneratedHashes(hashes);
  runNextBuild(buildId);

  const finalHashes = collectInlineHashes(serverOutputDirectory);
  const missingScripts = finalHashes.scripts.filter((hash) => !hashes.scripts.includes(hash));
  const missingStyles = finalHashes.styleAttributes.filter((hash) => !hashes.styleAttributes.includes(hash));
  if (!missingScripts.length && !missingStyles.length) {
    verified = true;
    console.log(
      `CSP build verified: ${finalHashes.scripts.length} script hashes and `
      + `${finalHashes.styleAttributes.length} allowlisted style attribute hashes cover the prerendered HTML.`,
    );
    break;
  }
  hashes = {
    scripts: [...new Set([...hashes.scripts, ...missingScripts])].sort(),
    styleAttributes: [...new Set([...hashes.styleAttributes, ...missingStyles])].sort(),
  };
}

if (!verified) {
  throw new Error('CSP inline script hashes did not stabilize across the production build passes.');
}
