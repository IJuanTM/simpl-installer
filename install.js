#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');
const {promisify} = require('util');
const {exec} = require('child_process');

const execAsync = promisify(exec);

const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', blue: '\x1b[34m', gray: '\x1b[90m', bold: '\x1b[1m', dim: '\x1b[2m'
};

const CDN_BASE = 'https://cdn.simpl.iwanvanderwal.nl/framework';

const log = (message, color = 'reset') => console.log(`${COLORS[color]}${message}${COLORS.reset}`);

const fetchUrl = (url) => new Promise((resolve, reject) => {
  https.get(url, res => {
    if (res.statusCode === 302 || res.statusCode === 301) return fetchUrl(res.headers.location).then(resolve).catch(reject);
    if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Request failed'}`));

    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => resolve(data));
  }).on('error', reject);
});

const downloadFile = (url, dest) => new Promise((resolve, reject) => {
  const file = fs.createWriteStream(dest);

  https.get(url, res => {
    if (res.statusCode === 302 || res.statusCode === 301) {
      fs.unlinkSync(dest);
      return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
    }
    if (res.statusCode !== 200) {
      fs.unlinkSync(dest);
      return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Request failed'}`));
    }

    res.pipe(file);
    file.on('finish', () => {
      file.close();
      resolve();
    });
  }).on('error', err => {
    fs.unlinkSync(dest);
    reject(err);
  });

  file.on('error', err => {
    fs.unlinkSync(dest);
    reject(err);
  });
});

const promptUser = (question) => new Promise(resolve => {
  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout
  });

  rl.question(question, answer => {
    rl.close();
    resolve(answer.trim());
  });
});

const showHelp = () => {
  console.log();
  log(`  ╭${'─'.repeat(62)}╮`);
  log(`  │  ${COLORS.bold}Simpl Installer${COLORS.reset}${' '.repeat(35)}│`);
  log(`  ╰${'─'.repeat(62)}╯`);
  log('  Usage:', 'cyan');
  log(`    ${makeClickable('npx @ijuantm/simpl-install [project-name] [version]', 'npx @ijuantm/simpl-install')}`);
  log(`    ${makeClickable('npx @ijuantm/simpl-install --list-versions', 'npx @ijuantm/simpl-install --list-versions')}`);
  log(`    ${makeClickable('npx @ijuantm/simpl-install --help', 'npx @ijuantm/simpl-install --help')}`);
  console.log();
  log('  Arguments:', 'cyan');
  log('    project-name    Name of the project directory (optional, will prompt)');
  log('    version         Simpl version (default: latest)');
  console.log();
  log('  Commands:', 'cyan');
  log('    --list-versions, -lv    List all available versions');
  log('    --help, -h              Show this help message');
  console.log();
  log('  Examples:', 'cyan');
  log(`    ${makeClickable('npx @ijuantm/simpl-install my-project', 'npx @ijuantm/simpl-install my-project')}`);
  log(`    ${makeClickable('npx @ijuantm/simpl-install my-project 1.5.0', 'npx @ijuantm/simpl-install my-project 1.5.0')}`);
  log(`    ${makeClickable('npx @ijuantm/simpl-install', 'npx @ijuantm/simpl-install')}`);
  console.log();
};

const listVersions = async () => {
  console.log();
  log(`  ╭${'─'.repeat(62)}╮`);
  log(`  │  ${COLORS.bold}Available Versions${COLORS.reset}${' '.repeat(42)}│`);
  log(`  ╰${'─'.repeat(62)}╯`);
  console.log();
  log('  📦 Fetching available versions...', 'bold');

  try {
    const response = await fetchUrl(`${CDN_BASE}/versions.json`);
    const {versions, latest} = JSON.parse(response);

    console.log();

    if (versions.length === 0) {
      log(`  ${COLORS.yellow}⚠${COLORS.reset} No versions available`);
    } else {
      versions.forEach(version => {
        if (version === latest) log(`  ${COLORS.cyan}•${COLORS.reset} ${COLORS.bold}${version}${COLORS.reset} ${COLORS.green}(latest)${COLORS.reset}`); else log(`  ${COLORS.cyan}•${COLORS.reset} ${version}`);
      });
    }
  } catch (error) {
    console.log();
    log(`  ${COLORS.red}✗${COLORS.reset} Failed to fetch versions: ${error.message}`, 'red');
    console.log();
    process.exit(1);
  }

  console.log();
};

const validateProjectName = (name) => {
  if (!name || name.length === 0) return 'Project name cannot be empty';
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return 'Project name can only contain letters, numbers, hyphens, and underscores';
  if (fs.existsSync(name)) return `Directory "${name}" already exists`;
  return null;
};

const countFiles = (dir) => {
  let count = 0;

  fs.readdirSync(dir, {withFileTypes: true}).forEach(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countFiles(fullPath); else count++;
  });

  return count;
};

const extractZip = async (zipPath, destDir) => {
  const tempExtract = path.join(process.cwd(), '__temp_extract__');

  if (process.platform === 'win32') {
    await execAsync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempExtract}' -Force"`);
  } else {
    await execAsync(`unzip -q "${zipPath}" -d "${tempExtract}"`);
  }

  const entries = fs.readdirSync(tempExtract, {withFileTypes: true});
  const sourceDir = entries.length === 1 && entries[0].isDirectory() ? path.join(tempExtract, entries[0].name) : tempExtract;

  fs.mkdirSync(destDir, {recursive: true});

  fs.readdirSync(sourceDir, {withFileTypes: true}).forEach(item => {
    fs.renameSync(path.join(sourceDir, item.name), path.join(destDir, item.name));
  });

  fs.rmSync(tempExtract, {recursive: true, force: true});
};


const downloadFramework = async (projectName, version) => {
  const zipUrl = `${CDN_BASE}/${version}/src.zip`;
  const tempZip = path.join(process.cwd(), 'temp.zip');
  const targetDir = path.join(process.cwd(), projectName);

  await downloadFile(zipUrl, tempZip);

  fs.mkdirSync(targetDir, {recursive: true});
  await extractZip(tempZip, targetDir);

  fs.unlinkSync(tempZip);

  return countFiles(targetDir);
};

const makeClickable = (text, command) => `\x1b]8;;file:///${command}\x07${text}\x1b]8;;\x07`;

const main = async () => {
  const args = process.argv.slice(2);
  const firstArg = args[0];

  if (firstArg === '--help' || firstArg === '-h') {
    showHelp();
    process.exit(0);
  }

  if (firstArg === '--list-versions' || firstArg === '-lv') {
    await listVersions();
    process.exit(0);
  }

  let projectName = firstArg && !firstArg.startsWith('-') ? firstArg : null;
  let version = args[1] || 'latest';

  if (!projectName) {
    console.log();
    log(`  ╭${'─'.repeat(62)}╮`);
    log(`  │  ${COLORS.bold}Simpl Installer${COLORS.reset}${' '.repeat(45)}│`);
    log(`  ╰${'─'.repeat(62)}╯`);
    console.log();

    while (true) {
      projectName = await promptUser('  Project name: ');
      const error = validateProjectName(projectName);

      if (error) {
        log(`  ${COLORS.red}✗${COLORS.reset} ${error}`, 'red');
        console.log();
        continue;
      }

      break;
    }
  } else {
    const error = validateProjectName(projectName);

    if (error) {
      console.log();
      log(`  ${COLORS.red}✗${COLORS.reset} ${error}`, 'red');
      console.log();
      process.exit(1);
    }
  }

  console.log();
  log(`  ╭${'─'.repeat(62)}╮`);
  log(`  │  ${COLORS.bold}Installing: ${COLORS.cyan}${projectName}${COLORS.reset} ${COLORS.dim}(v${version})${COLORS.reset}${' '.repeat(35 - projectName.length - version.length)}│`);
  log(`  ╰${'─'.repeat(62)}╯`);
  console.log();
  log('  📦 Downloading files...', 'bold');

  try {
    const fileCount = await downloadFramework(projectName, version);

    console.log();
    log(`  ${COLORS.green}✓${COLORS.reset} Downloaded ${COLORS.bold}${fileCount}${COLORS.reset} file${fileCount !== 1 ? 's' : ''}`);
    console.log();
    log('  ' + '─'.repeat(16), 'gray');
    console.log();
    log(`  ${COLORS.bold}Getting started:${COLORS.reset}`, 'cyan');
    log(`    ${COLORS.dim}1.${COLORS.reset} Navigate to the project directory with ${makeClickable(`${COLORS.cyan}cd ${projectName}${COLORS.reset}`, `cd ${projectName}`)}.`);
    log(`    ${COLORS.dim}2.${COLORS.reset} Run ${makeClickable(`${COLORS.cyan}composer install && npm install${COLORS.reset}`, 'composer install && npm install')} to install dependencies.`);
    log(`    ${COLORS.dim}3.${COLORS.reset} Set up a virtual host pointing to the "public" directory.`);
    log(`    ${COLORS.dim}4.${COLORS.reset} Run ${makeClickable(`${COLORS.cyan}npm run dev${COLORS.reset}`, 'npm run dev')} to start developing!`);
    console.log();
    log(`  ${COLORS.dim}Install add-ons with:${COLORS.reset} ${makeClickable(`${COLORS.cyan}npx @ijuantm/simpl-addon <name>${COLORS.reset}`, 'npx @ijuantm/simpl-addon')}`);
    console.log();
    log(`  ${COLORS.green}✓${COLORS.reset} ${COLORS.bold}${COLORS.green}Installation complete!${COLORS.reset}`, 'green');
    console.log();
  } catch (error) {
    console.log();
    log(`  ${COLORS.red}✗${COLORS.reset} Installation failed: ${error.message}`, 'red');
    log(`  ${COLORS.dim}Make sure version "${version}" exists on the CDN${COLORS.reset}`);
    console.log();
    process.exit(1);
  }
};

main().catch(err => {
  log(`\n  ${COLORS.red}✗${COLORS.reset} Fatal error: ${err.message}\n`, 'red');
  process.exit(1);
});
