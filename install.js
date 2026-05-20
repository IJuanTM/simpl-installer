#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const readline = require('readline');
const {promisify} = require('util');
const {exec} = require('child_process');

const execAsync = promisify(exec);

const C = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', blue: '\x1b[34m', gray: '\x1b[90m', bold: '\x1b[1m', dim: '\x1b[2m',
};

const CDN_BASE = 'https://cdn.simpl.iwanvanderwal.nl/framework';
const LOCAL_RELEASES_DIR = process.env.SIMPL_LOCAL_RELEASES || path.join(process.cwd(), 'simpl-local-releases');
const BOX_WIDTH = 62;
const PAD = '  ';
const DEFAULT_APP_URL = 'http://simpl.local';
const TEMP_DIR_PREFIX = 'simpl-install-';

const styled = (msg, ...styles) => styles.join('') + msg + C.reset;
const line = (msg = '') => console.log(msg);
const out = (msg, color = C.reset) => console.log(color + msg + C.reset);
const prefixed = (symbol, color, msg, bold = false, dim = false) => out(PAD + color + symbol + C.reset + ' ' + (bold ? styled(msg, C.bold) : dim ? styled(msg, C.dim) : msg));

const success = (msg, bold = false) => prefixed('✓', C.green, msg, bold);
const error = (msg, bold = false) => prefixed('✕', C.red, msg, bold);
const warn = (msg, bold = false) => prefixed('⚠', C.yellow, msg, bold);
const info = (msg) => prefixed('◌', C.cyan, msg, false, true);
const task = (msg) => out(PAD + msg);
const item = (msg, dim = false) => out(PAD + C.cyan + '•' + C.reset + ' ' + (dim ? styled(msg, C.dim) : msg));

const box = (title) => {
  const plain = title.replace(/\x1b\[[0-9;]*m/g, '');
  const truncated = plain.length > BOX_WIDTH - 2 ? plain.slice(0, BOX_WIDTH - 5) + '...' : plain;
  const displayTitle = title.replace(plain, truncated);
  const spaces = ' '.repeat(BOX_WIDTH - 2 - truncated.length);
  line();
  out(PAD + '╭' + '─'.repeat(BOX_WIDTH) + '╮');
  out(PAD + '│ ' + styled(displayTitle, C.bold) + spaces + ' │');
  out(PAD + '╰' + '─'.repeat(BOX_WIDTH) + '╯');
};

const divider = () => {
  line();
  out(PAD + '─'.repeat(16), C.dim);
  line();
};

const printAnswer = (question, value) => out(`${question}: ${C.cyan}${value}${C.reset}`);

const cleanupPath = (targetPath) => {
  try {
    fs.rmSync(targetPath, {recursive: true, force: true});
  } catch {
  }
};

const resolveRedirectUrl = (baseUrl, location) => new URL(location, baseUrl).toString();

const isRedirect = (statusCode) => [301, 302].includes(statusCode);
const checkStatus = (statusCode, statusMessage, location, url) => {
  if (isRedirect(statusCode)) {
    if (!location) throw new Error(`HTTP ${statusCode}: Redirect missing location`);
    return resolveRedirectUrl(url, location);
  }
  if (statusCode !== 200) throw new Error(`HTTP ${statusCode}: ${statusMessage || 'Request failed'}`);
  return null;
};

const fetchUrl = (url) => new Promise((resolve, reject) => {
  https.get(url, res => {
    try {
      const redirect = checkStatus(res.statusCode, res.statusMessage, res.headers.location, url);
      if (redirect) return fetchUrl(redirect).then(resolve).catch(reject);
    } catch (err) {
      return reject(err);
    }
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => resolve(data));
  }).on('error', reject).setTimeout(10000, () => reject(new Error('Request timed out')));
});

const downloadFile = (url, dest) => new Promise((resolve, reject) => {
  const file = fs.createWriteStream(dest);
  let settled = false;
  const fail = (err) => {
    if (settled) return;
    settled = true;
    cleanupPath(dest);
    reject(err);
  };

  https.get(url, res => {
    try {
      const redirect = checkStatus(res.statusCode, res.statusMessage, res.headers.location, url);
      if (redirect) return downloadFile(redirect, dest).then(resolve).catch(reject);
    } catch (err) {
      return fail(err);
    }
    res.pipe(file);
    file.on('finish', () => file.close(err => err ? fail(err) : resolve()));
  }).on('error', fail);
  file.on('error', fail);
});

const promptUser = (question, defaultValue = '') => new Promise(resolve => {
  const rl = readline.createInterface({input: process.stdin, output: process.stdout});
  const prompt = defaultValue ? `${question} ${C.dim}(${defaultValue})${C.reset}: ` : `${question}: `;
  rl.question(prompt, answer => {
    rl.close();
    resolve(answer.trim() || defaultValue);
  });
});

const parseArgs = (args) => {
  const result = {version: null, name: null, url: null, local: false, listVersions: false, help: false, unknownFlags: []};
  const flagMap = {'--help': 'help', '-h': 'help', '--list-versions': 'listVersions', '-lv': 'listVersions', '--local': 'local', '-l': 'local'};
  const valueFlags = {'--version=': 'version', '-v=': 'version', '--name=': 'name', '-n=': 'name', '--url=': 'url', '-u=': 'url'};

  for (const arg of args) {
    if (flagMap[arg]) result[flagMap[arg]] = true;
    else {
      let matched = false;
      for (const [prefix, key] of Object.entries(valueFlags)) {
        if (arg.startsWith(prefix)) {
          result[key] = arg.slice(prefix.length).trim() || null;
          matched = true;
          break;
        }
      }
      if (!matched) arg.startsWith('-') ? result.unknownFlags.push(arg) : !result.name && (result.name = arg);
    }
  }
  return result;
};

const KNOWN_FLAGS = ['--version', '-v', '--name', '-n', '--url', '-u', '--local', '-l', '--list-versions', '-lv', '--help', '-h'];

const levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m + 1}, (_, i) => Array.from({length: n + 1}, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
};

const closestMatch = (input, options) => {
  let best = null, bestDist = Infinity;
  for (const opt of options) {
    const dist = levenshtein(input.toLowerCase(), opt.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = opt;
    }
  }
  return bestDist <= Math.max(3, Math.floor(input.length / 2)) ? best : null;
};

const printVersionList = (versions) => {
  for (const [v, meta] of Object.entries(versions)) {
    let ln = PAD + C.cyan + '•' + C.reset + ' ';
    ln += meta['is-latest'] ? styled(v, C.bold) + ' ' + styled('(latest)', C.green) : styled(v, C.dim);
    ln += meta['is-pre-release'] ? ' ' + styled('(pre-release)', C.yellow) : '';
    ln += meta['script-compatible'] === false ? ' ' + styled('(manual download required)', C.red) : '';
    out(ln);
  }
};

const getLatestVersion = (versions) => {
  const latestEntry = Object.entries(versions).find(([, meta]) => meta['is-latest'] === true);
  return latestEntry?.[0] || Object.keys(versions)[0] || null;
};

const resolveVersionInput = (versions, input) => {
  const value = String(input || '').trim();
  if (!value) return {valid: false};
  if (value.toLowerCase() === 'latest') {
    const latest = getLatestVersion(versions);
    return latest ? {valid: true, version: latest, display: latest} : {valid: false};
  }
  return versions[value] ? {valid: true, version: value, display: value} : {valid: false};
};

const showVersionList = (versions) => {
  line();
  out(PAD + styled('Available versions:', C.bold), C.blue);
  printVersionList(versions);
};

const confirmSuggestion = async (suggestion) => {
  line();
  while (true) {
    const a = (await promptUser(PAD + `${C.cyan}◌${C.reset} ${C.dim}Did you mean${C.reset} ${C.cyan}${suggestion}${C.reset}${C.dim}?${C.reset}`, 'n')).toLowerCase();
    if (['y', 'yes'].includes(a)) return true;
    if (['n', 'no'].includes(a)) return false;
    warn('Please answer [Y] Yes or [N] No)');
    line();
  }
};

const resolveVersion = async (versions, preset = null) => {
  const versionList = Object.keys(versions);
  const suggestionOptions = [...versionList, 'latest'];

  const handleInvalid = async (input) => {
    line();
    error(`Version ${styled(input, C.bold)} not found`);
    const suggestion = closestMatch(input, suggestionOptions);
    if (suggestion && await confirmSuggestion(suggestion)) {
      const resolved = resolveVersionInput(versions, suggestion);
      if (!resolved.valid) {
        showVersionList(versions);
        return null;
      }
      line();
      printAnswer(PAD + 'Simpl version', resolved.display);
      return resolved.version;
    }
    showVersionList(versions);
    return null;
  };

  if (preset) {
    const resolved = resolveVersionInput(versions, preset);
    if (resolved.valid) {
      line();
      printAnswer(PAD + 'Simpl version', resolved.display);
      return resolved.version;
    }
    const result = await handleInvalid(preset);
    if (result) return result;
  }

  while (true) {
    line();
    const input = await promptUser(PAD + 'Simpl version');
    if (!input) {
      warn('Version cannot be empty');
      continue;
    }
    const resolved = resolveVersionInput(versions, input);
    if (resolved.valid) return resolved.version;
    const result = await handleInvalid(input);
    if (result) return result;
  }
};

const showHelp = () => {
  box(`Simpl Installer ${C.dim}-${C.reset} ${C.blue}Help${C.reset}`);
  line();
  out(PAD + styled('Options:', C.bold), C.blue);
  out(PAD + styled('--version=<v>, -v=<v>', C.dim) + '       Framework version to install (use latest for the newest release)');
  out(PAD + styled('--name=<name>, -n=<name>', C.dim) + '    Project name');
  out(PAD + styled('--url=<url>, -u=<url>', C.dim) + '       App URL (must start with http:// or https://)');
  out(PAD + styled('--list-versions, -lv', C.dim) + '        List all available versions');
  out(PAD + styled('--help, -h', C.dim) + '                  Show this help message');
  line();
  out(PAD + styled('Usage:', C.bold), C.blue);
  out(PAD + styled('npx @ijuantm/simpl-install', C.dim));
  out(PAD + styled('npx @ijuantm/simpl-install --name="My Project" --url="http://my-project.local"', C.dim));
  out(PAD + styled('npx @ijuantm/simpl-install --version=latest --name="Simpl Test"', C.dim));
  out(PAD + styled('npx @ijuantm/simpl-install --list-versions', C.dim));
  out(PAD + styled('npx @ijuantm/simpl-install -h', C.dim));
  line();
};

const listVersions = async () => {
  box(`Simpl Installer ${C.dim}-${C.reset} ${C.blue}Available Versions${C.reset}`);
  line();
  task('📦 Fetching available versions...');
  try {
    const {versions} = JSON.parse(await fetchUrl(`${CDN_BASE}/versions.json`));
    if (!Object.keys(versions).length) warn('No versions available');
    else showVersionList(versions);
  } catch {
    line();
    error('Failed to fetch versions');
    line();
    process.exit(1);
  }
  line();
};

const projectNameToUrlSlug = (name = '') => name.trim().toLowerCase().replace(/[\s_]+/g, '-');

const validateProjectName = (name) => {
  if (!name?.trim()) return 'Project name cannot be empty';
  if (!/^[a-zA-Z0-9 _-]+$/.test(name)) return 'Project name can only contain letters, numbers, spaces, hyphens, and underscores';
  return fs.existsSync(projectNameToUrlSlug(name)) ? `Directory "${projectNameToUrlSlug(name)}" already exists` : null;
};

const validateUrl = (url) => {
  if (!url?.length) return 'URL cannot be empty';
  const trimmed = url.trim().replace(/\/+$/, '');
  return /^https?:\/\/.+/.test(trimmed) ? trimmed : 'URL must start with http:// or https://';
};

const getProjectBasedAppUrlDefault = (projectName) => {
  const slug = projectNameToUrlSlug(projectName);
  return slug ? `http://${slug}.local` : DEFAULT_APP_URL;
};

const extractHostFromUrl = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
};

const countFiles = (dir) => fs.readdirSync(dir, {withFileTypes: true}).reduce((count, entry) =>
  count + (entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1), 0);

const replaceInFile = (filePath, replacements) => {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = content;
  for (const [search, replace] of Object.entries(replacements))
    if (modified.includes(search)) modified = modified.split(search).join(replace);
  if (modified !== content) fs.writeFileSync(filePath, modified, 'utf8');
};

const replaceInDirectory = (dir, replacements) => {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) replaceInDirectory(fullPath, replacements);
    else if (entry.isFile()) replaceInFile(fullPath, replacements);
  }
};

const extractZip = async (zipPath, destDir) => {
  fs.mkdirSync(destDir, {recursive: true});
  const cmd = process.platform === 'win32'
    ? `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`
    : `unzip -q "${zipPath}" -d "${destDir}"`;
  await execAsync(cmd);
  const entries = fs.readdirSync(destDir, {withFileTypes: true});
  if (entries.length === 1 && entries[0].isDirectory()) {
    const nestedDir = path.join(destDir, entries[0].name);
    for (const item of fs.readdirSync(nestedDir, {withFileTypes: true}))
      fs.cpSync(path.join(nestedDir, item.name), path.join(destDir, item.name), {recursive: true});
    fs.rmSync(nestedDir, {recursive: true, force: true});
  }
};

const checkServerAvailability = () => new Promise(resolve => {
  https.get(`${CDN_BASE}/versions.json`, {timeout: 5000}, res => {
    res.resume();
    resolve(res.statusCode === 200);
  }).on('error', () => resolve(false)).on('timeout', () => resolve(false));
});

const getVersionsData = async () => {
  try {
    return JSON.parse(await fetchUrl(`${CDN_BASE}/versions.json`));
  } catch {
    return {versions: {}};
  }
};

const downloadFramework = async (projectFolderName, version, forceLocal) => {
  const targetDir = path.join(process.cwd(), projectFolderName);
  const localZipPath = path.join(LOCAL_RELEASES_DIR, version, 'src.zip');

  if (forceLocal && !fs.existsSync(localZipPath)) throw new Error(`Local release not found: ${localZipPath}`);

  if (forceLocal || fs.existsSync(localZipPath)) {
    line();
    task('💻 Using local release files');
    await extractZip(localZipPath, targetDir);
    return countFiles(targetDir);
  }

  if (!await checkServerAvailability()) throw new Error('CDN server is currently unreachable');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_DIR_PREFIX));
  const tempZip = path.join(tempDir, 'src.zip');
  try {
    await downloadFile(`${CDN_BASE}/${version}/src.zip`, tempZip);
    await extractZip(tempZip, targetDir);
  } finally {
    cleanupPath(tempDir);
  }
  return countFiles(targetDir);
};

const main = async () => {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    showHelp();
    process.exit(0);
  }
  if (parsed.listVersions) {
    await listVersions();
    process.exit(0);
  }

  if (parsed.unknownFlags.length) {
    for (const flag of parsed.unknownFlags) {
      const flagName = flag.includes('=') ? flag.slice(0, flag.indexOf('=')) : flag;
      line();
      warn(`Unknown option: ${styled(flag, C.bold)}`);
      line();
      const suggestion = closestMatch(flagName, KNOWN_FLAGS);
      if (suggestion) info(`Did you mean ${C.cyan}${suggestion}${C.reset}${C.dim}?${C.reset}`);
    }
    info('Run with --help to see all available options.');
    line();
    process.exit(1);
  }

  box(`Simpl Installer ${C.dim}-${C.reset} ${C.blue}Install New Project${C.reset}`);
  const {versions} = await getVersionsData();
  const version = await resolveVersion(versions, parsed.version);

  if (versions[version]?.['script-compatible'] === false) {
    line();
    error(`Version ${styled(version, C.bold)} is not compatible with this installer`);
    line();
    out(PAD + styled('Manual download required:', C.bold), C.blue);
    out(PAD + `${C.cyan}${CDN_BASE}/${version}/src.zip${C.reset}`);
    line();
    process.exit(1);
  }

  let projectName;
  if (parsed.name) {
    const err = validateProjectName(parsed.name);
    if (err) {
      line();
      error(err);
      line();
      process.exit(1);
    }
    projectName = parsed.name;
    printAnswer(PAD + 'Project name', projectName);
  } else {
    while (true) {
      projectName = await promptUser(PAD + 'Project name');
      const err = validateProjectName(projectName);
      if (!err) break;
      error(err);
      line();
    }
  }

  const resolveUrlInteractive = async () => {
    while (true) {
      const result = validateUrl(await promptUser(PAD + 'App URL', getProjectBasedAppUrlDefault(projectName)));
      if (typeof result === 'string' && result.startsWith('http')) return result;
      error(result);
      line();
    }
  };

  let appUrl;
  if (parsed.url) {
    const result = validateUrl(parsed.url);
    if (typeof result !== 'string' || !result.startsWith('http')) {
      line();
      warn(`Invalid URL: ${result}`);
      info('Please enter a valid URL (e.g. http://my-project.local)');
      line();
      appUrl = await resolveUrlInteractive();
    } else {
      appUrl = result;
      printAnswer(PAD + 'App URL', appUrl);
    }
  } else {
    appUrl = await resolveUrlInteractive();
  }

  const projectFolderName = projectNameToUrlSlug(projectName);
  box(`Installing: ${C.cyan}${projectName}${C.reset} ${C.dim}(${version})${C.reset}`);
  line();
  task('📦 Downloading files...');

  try {
    const fileCount = await downloadFramework(projectFolderName, version, parsed.local);
    line();
    success(`Downloaded ${styled(String(fileCount), C.bold)} file${fileCount !== 1 ? 's' : ''}`);
    line();
    task('⚙️ Configuring project...');

    const targetDir = path.join(process.cwd(), projectFolderName);
    replaceInDirectory(targetDir, {'@app-name': projectName, '@app-url': appUrl, '@app-host': extractHostFromUrl(appUrl)});

    line();
    success(`Configured ${C.cyan}${projectName}${C.reset} with URL ${C.cyan}${appUrl}${C.reset}`);
    divider();
    out(PAD + styled('Getting started:', C.bold), C.blue);
    item(`Navigate to the project directory with ${C.dim}cd ${projectFolderName}${C.reset}`);
    item(`Install dependencies with ${C.dim}composer install && npm install${C.reset}`);
    item(`Set up a virtual host pointing to the ${C.dim}public${C.reset} directory`);
    item(`Start developing with ${C.dim}npm run dev${C.reset}`);
    line();
    out(PAD + styled('Install add-ons:', C.bold), C.blue);
    item(styled('npx @ijuantm/simpl-addon --addon=<name>', C.dim));
    item(styled('npx @ijuantm/simpl-addon --list', C.dim) + '            List available add-ons');
    line();
    success(styled('Installation complete!', C.bold, C.green), true);
    line();
  } catch (err) {
    line();
    error('Installation failed');
    if (err.message === 'CDN server is currently unreachable') info('The CDN server is currently unavailable. Please try again later.');
    else if (err.message.includes('Local release not found')) info(err.message);
    else info('Please verify the version exists or try again later');
    line();
    process.exit(1);
  }
};

main().catch(() => {
  line();
  error('Fatal error occurred');
  line();
  process.exit(1);
});
