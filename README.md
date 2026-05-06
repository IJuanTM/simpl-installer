# Simpl Installer

CLI tool for installing the Simpl PHP framework with `npx`.

## What it does

- Downloads the selected Simpl release
- Creates a new project directory
- Replaces framework placeholders such as the app name, app URL, and host
- Prints the next steps after installation

## Usage

Run the installer with no arguments to be prompted for everything:

```bash
npx @ijuantm/simpl-install
```

Or provide the project name up front:

```bash
npx @ijuantm/simpl-install my-project
```

You can also pass explicit options:

```bash
npx @ijuantm/simpl-install my-project --version=latest --url=https://example.com
```

The first non-flag argument is treated as the project name. If you do not pass `--name`, the installer will ask for it interactively.

### Available options

| Option                       | Description                                                        |
|------------------------------|--------------------------------------------------------------------|
| `--version=<v>`, `-v=<v>`    | Framework version to install. Use `latest` for the newest release. |
| `--name=<name>`, `-n=<name>` | Project name.                                                      |
| `--url=<url>`, `-u=<url>`    | App URL. Must start with `http://` or `https://`.                  |
| `--list-versions`, `-lv`     | List all available versions.                                       |
| `--help`, `-h`               | Show the help message.                                             |

### Helpful commands

List available versions:

```bash
npx @ijuantm/simpl-install --list-versions
```

Show help:

```bash
npx @ijuantm/simpl-install --help
```

## After installation

```bash
cd my-project
composer install && npm install
```

Then point your web server or local host configuration to the `public` directory and start developing with:

```bash
npm run dev
```

For more details, see the README in the generated project directory or the [documentation](https://simpl.iwanvanderwal.nl/docs).

## Add-ons

After installing the framework, you can install add-ons with:

```bash
npx @ijuantm/simpl-addon --addon=<name>
```

To list available add-ons:

```bash
npx @ijuantm/simpl-addon --list
```

## Requirements

- **Node.js**: >= 22
- **PHP**: >= 8.5.x
- **Composer**: latest version
