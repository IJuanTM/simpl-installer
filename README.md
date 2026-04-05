# Simpl Installer

CLI tool for installing the Simpl PHP framework automatically using npx.

The installer is interactive: it prompts for a Simpl version, project name, and app URL. You can also provide the project name and app URL up front as optional positional arguments.

## Usage

### Install the Framework

Create a new Simpl project by running the following command, change `my-project` to your desired project name:

```bash
npx @ijuantm/simpl-install my-project
```

Or run without arguments to be prompted for everything:

```bash
npx @ijuantm/simpl-install
```

You can also provide an app URL:

```bash
npx @ijuantm/simpl-install my-project https://example.com
```

The installer will:

1. Fetch the available Simpl versions
2. Prompt for the version, project name, and app URL
3. Download and extract the selected framework release
4. Set up all necessary files and folders

### Get Help

```bash
npx @ijuantm/simpl-install --help
```

To list available versions:

```bash
npx @ijuantm/simpl-install --list-versions
```

To force local release files when available:

```bash
npx @ijuantm/simpl-install --local
```

## Post-Installation Steps

After the installation completes, run the following commands:

```bash
cd my-project
composer install && npm install
```

For more details, see the README file in the project directory, or in the [documentation](https://simpl.iwanvanderwal.nl/docs).

## Installing Add-ons

Once your framework is installed, you can add functionality with add-ons, for example, to install the "auth" add-on:

```bash
npx @ijuantm/simpl-addon auth
```

See available add-ons:

```bash
npx @ijuantm/simpl-addon --list, -lv
```

## Requirements

- **Node.js**: >= 22.x.x
- **PHP**: >= 8.5.x
- **Composer**: Latest version
