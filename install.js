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
const LOCAL_RELEASES_DIR = process.env.SIMPL_LOCAL_RELEASES || path.join(process.cwd(), 'releases');

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
  const rl = readline.createInterface({input: process.stdin, output: process.stdout});
  rl.question(question, answer => {
    rl.close();
    resolve(answer.trim());
  });
});

const showHelp = () => {
  console.log();
  log(`  ╭${'─'.repeat(62)}╮`);
  log(`  │  ${COLORS.bold}Simpl Installer${COLORS.reset}${' '.repeat(45)}│`);
  log(`  ╰${'─'.repeat(62)}╯`);
  console.log();
  log(`  ${COLORS.bold}Usage:${COLORS.reset}`, 'blue');
  log(`    ${COLORS.dim}npx @ijuantm/simpl-install [project-name] [version]${COLORS.reset}`);
  log(`    ${COLORS.dim}npx @ijuantm/simpl-install --list-versions${COLORS.reset}`);
  log(`    ${COLORS.dim}npx @ijuantm/simpl-install --help${COLORS.reset}`);
  console.log();
  log(`  ${COLORS.bold}Arguments:${COLORS.reset}`, 'blue');
  log(`    ${COLORS.dim}project-name${COLORS.reset}    Name of the project directory (optional, will prompt)`);
  log(`    ${COLORS.dim}version${COLORS.reset}         Simpl version (default: latest)`);
  console.log();
  log(`  ${COLORS.bold}Commands:${COLORS.reset}`, 'blue');
  log(`    ${COLORS.dim}--list-versions, -lv${COLORS.reset}    List all available versions`);
  log(`    ${COLORS.dim}--help, -h${COLORS.reset}              Show this help message`);
  console.log();
  log(`  ${COLORS.bold}Examples:${COLORS.reset}`, 'blue');
  log(`    ${COLORS.dim}npx @ijuantm/simpl-install my-project${COLORS.reset}`);
  log(`    ${COLORS.dim}npx @ijuantm/simpl-install my-project 1.5.0${COLORS.reset}`);
  log(`    ${COLORS.dim}npx @ijuantm/simpl-install${COLORS.reset}`);
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
    const {versions, latest} = JSON.parse(await fetchUrl(`${CDN_BASE}/versions.json`));
    console.log();

    if (versions.length === 0) {
      log(`  ${COLORS.yellow}⚠${COLORS.reset} No versions available`);
    } else {
      versions.forEach(v => {
        if (v === latest) log(`  ${COLORS.cyan}•${COLORS.reset} ${COLORS.bold}${v}${COLORS.reset} ${COLORS.green}(latest)${COLORS.reset}`);
        else log(`  ${COLORS.cyan}•${COLORS.reset} ${COLORS.dim}${v}${COLORS.reset}`);
      });
    }
  } catch (error) {
    console.log();
    log(`  ${COLORS.red}✗${COLORS.reset} Failed to fetch versions`, 'red');
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
    if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
    else count++;
  });
  return count;
};

const extractZip = async (zipPath, destDir) => {
  fs.mkdirSync(destDir, {recursive: true});

  if (process.platform === 'win32') await execAsync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`);
  else await execAsync(`unzip -q "${zipPath}" -d "${destDir}"`);

  const entries = fs.readdirSync(destDir, {withFileTypes: true});

  if (entries.length === 1 && entries[0].isDirectory()) {
    const nestedDir = path.join(destDir, entries[0].name);
    fs.readdirSync(nestedDir).forEach(item => fs.renameSync(path.join(nestedDir, item), path.join(destDir, item)));
    fs.rmdirSync(nestedDir);
  }
};

const checkServerAvailability = () => new Promise(resolve => {
  const req = https.get(`${CDN_BASE}/versions.json`, {timeout: 5000}, res => {
    res.resume();
    resolve(res.statusCode === 200);
  });
  req.on('error', () => resolve(false));
  req.on('timeout', () => {
    req.destroy();
    resolve(false);
  });
});

const downloadFramework = async (projectName, version) => {
  const targetDir = path.join(process.cwd(), projectName);
  const localZipPath = path.join(LOCAL_RELEASES_DIR, version, 'src.zip');

  if (fs.existsSync(localZipPath)) {
    console.log();
    log(`  💻 Using local release files`, 'bold');
    await extractZip(localZipPath, targetDir);
    return countFiles(targetDir);
  }

  if (!await checkServerAvailability()) throw new Error('CDN server is currently unreachable');

  const tempZip = path.join(process.cwd(), 'temp.zip');
  await downloadFile(`${CDN_BASE}/${version}/src.zip`, tempZip);
  await extractZip(tempZip, targetDir);
  fs.unlinkSync(tempZip);

  return countFiles(targetDir);
};

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
  const version = args[1] || 'latest';

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
  log(`  │  ${COLORS.bold}Installing: ${COLORS.cyan}${projectName}${COLORS.reset} ${COLORS.dim}(${version})${COLORS.reset}${' '.repeat(45 - projectName.length - version.length)}│`);
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
    log(`  ${COLORS.bold}Getting started:${COLORS.reset}`, 'blue');
    log(`    ${COLORS.dim}1.${COLORS.reset} Navigate to the project directory with ${COLORS.dim}cd ${projectName}${COLORS.reset}`);
    log(`    ${COLORS.dim}2.${COLORS.reset} Install dependencies with ${COLORS.dim}composer install && npm install${COLORS.reset}`);
    log(`    ${COLORS.dim}3.${COLORS.reset} Set up a virtual host pointing to the ${COLORS.dim}public${COLORS.reset} directory`);
    log(`    ${COLORS.dim}4.${COLORS.reset} Start developing with ${COLORS.dim}npm run dev${COLORS.reset}`);
    console.log();
    log(`  ${COLORS.bold}Install add-ons:${COLORS.reset}`, 'blue');
    log(`    ${COLORS.dim}npx @ijuantm/simpl-addon <name>${COLORS.reset}`);
    log(`    ${COLORS.dim}npx @ijuantm/simpl-addon --list, -lv${COLORS.reset}    List available add-ons`);
    console.log();
    log(`  ${COLORS.green}✓${COLORS.reset} ${COLORS.bold}${COLORS.green}Installation complete!${COLORS.reset}`, 'green');
    console.log();
  } catch (error) {
    console.log();
    log(`  ${COLORS.red}✗${COLORS.reset} Installation failed`, 'red');
    if (error.message === 'CDN server is currently unreachable') log(`  ${COLORS.dim}The CDN server is currently unavailable. Please try again later.${COLORS.reset}`);
    else log(`  ${COLORS.dim}Please verify the version exists or try again later${COLORS.reset}`);
    console.log();
    process.exit(1);
  }
};

main().catch(() => {
  log(`\n  ${COLORS.red}✗${COLORS.reset} Fatal error occurred\n`, 'red');
  process.exit(1);
});
