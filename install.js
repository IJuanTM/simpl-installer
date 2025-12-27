#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', blue: '\x1b[34m', gray: '\x1b[90m', bold: '\x1b[1m', dim: '\x1b[2m'
};

const BRANCH = 'update/1.5.0';
const REPO_BASE = 'https://api.github.com/repos/IJuanTM/simpl/contents/src';
const RAW_BASE = `https://raw.githubusercontent.com/IJuanTM/simpl/${BRANCH}/src`;

const log = (message, color = 'reset') => console.log(`${COLORS[color]}${message}${COLORS.reset}`);

const fetchUrl = (url) => new Promise((resolve, reject) => {
  const headers = {'User-Agent': 'simpl-installer'};
  if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;

  https.get(url, {headers}, res => {
    if (res.statusCode === 302 || res.statusCode === 301) return fetchUrl(res.headers.location).then(resolve).catch(reject);
    if (res.statusCode === 403) {
      const resetTime = res.headers['x-ratelimit-reset'];
      const resetDate = resetTime ? new Date(resetTime * 1000).toLocaleTimeString() : 'unknown';
      return reject(new Error(`GitHub API rate limit exceeded. Resets at ${resetDate}.`));
    }
    if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Request failed'}`));

    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => resolve(data));
  }).on('error', reject);
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
  log(`  │  ${COLORS.bold}Simpl Framework Installer${COLORS.reset}${' '.repeat(35)}│`);
  log(`  ╰${'─'.repeat(62)}╯`);
  console.log();
  log('  Usage:', 'cyan');
  log('    npx @ijuantm/simpl-install [project-name]');
  log('    npx @ijuantm/simpl-install --help');
  console.log();
  log('  Examples:', 'cyan');
  log('    npx @ijuantm/simpl-install my-project');
  log('    npx @ijuantm/simpl-install');
  console.log();
  log('  If no project name is provided, you will be prompted to enter one.');
  console.log();
};

const validateProjectName = (name) => {
  if (!name || name.length === 0) return 'Project name cannot be empty';
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return 'Project name can only contain letters, numbers, hyphens, and underscores';
  if (fs.existsSync(name)) return `Directory "${name}" already exists`;
  return null;
};

const downloadFramework = async (projectName) => {
  const targetDir = path.join(process.cwd(), projectName);
  let fileCount = 0;

  const processFiles = async (fileList, basePath = '') => {
    for (const file of fileList) {
      const relativePath = path.join(basePath, file.name).replace(/\\/g, '/');
      const destPath = path.join(targetDir, relativePath);

      if (file.type === 'dir') {
        const subUrl = file.url.includes('?') ? `${file.url}&ref=${BRANCH}` : `${file.url}?ref=${BRANCH}`;
        const subFiles = JSON.parse(await fetchUrl(subUrl));
        await processFiles(subFiles, relativePath);
      } else {
        const content = await fetchUrl(`${RAW_BASE}/${relativePath}`);
        fs.mkdirSync(path.dirname(destPath), {recursive: true});
        fs.writeFileSync(destPath, content, 'utf8');
        fileCount++;
      }
    }
  };

  const frameworkUrl = `${REPO_BASE}?ref=${BRANCH}`;
  const files = JSON.parse(await fetchUrl(frameworkUrl));
  await processFiles(files);

  return fileCount;
};

const main = async () => {
  const args = process.argv.slice(2);
  const firstArg = args[0];

  if (firstArg === '--help' || firstArg === '-h') {
    showHelp();
    process.exit(0);
  }

  let projectName = firstArg;

  if (!projectName) {
    console.log();
    log(`  ╭${'─'.repeat(62)}╮`);
    log(`  │  ${COLORS.bold}Simpl Framework Installer${COLORS.reset}${' '.repeat(35)}│`);
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
  log(`  │  ${COLORS.bold}Installing: ${COLORS.cyan}${projectName}${COLORS.reset}${' '.repeat(49 - projectName.length)}│`);
  log(`  ╰${'─'.repeat(62)}╯`);
  console.log();
  log('  📦 Downloading framework from GitHub...', 'bold');

  try {
    const fileCount = await downloadFramework(projectName);

    console.log();
    log(`  ${COLORS.green}✓${COLORS.reset} Downloaded ${COLORS.bold}${fileCount}${COLORS.reset} file${fileCount !== 1 ? 's' : ''}`);
    console.log();
    log('  ' + '─'.repeat(16), 'gray');
    console.log();
    log(`  ${COLORS.bold}Next steps:${COLORS.reset}`, 'cyan');
    log(`    ${COLORS.dim}1.${COLORS.reset} cd ${projectName}`);
    log(`    ${COLORS.dim}2.${COLORS.reset} composer install`);
    log(`    ${COLORS.dim}3.${COLORS.reset} npm install`);
    log(`    ${COLORS.dim}4.${COLORS.reset} Configure your .env file`);
    log(`    ${COLORS.dim}5.${COLORS.reset} Set up your web server`);
    console.log();
    log(`  ${COLORS.dim}Install add-ons with:${COLORS.reset} ${COLORS.cyan}npx @ijuantm/simpl-addon <name>${COLORS.reset}`);
    console.log();
    log(`  ${COLORS.green}✓${COLORS.reset} ${COLORS.bold}${COLORS.green}Installation complete!${COLORS.reset}`, 'green');
    console.log();
  } catch (error) {
    console.log();
    log(`  ${COLORS.red}✗${COLORS.reset} Installation failed: ${error.message}`, 'red');
    console.log();
    process.exit(1);
  }
};

main().catch(err => {
  log(`\n  ${COLORS.red}✗${COLORS.reset} Fatal error: ${err.message}\n`, 'red');
  process.exit(1);
});
