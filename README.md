# Simpl Installer

CLI tool for installing the Simpl PHP framework automatically using npx.

## Usage

### Install the Framework

Create a new Simpl project by running the following command, change `my-project` to your desired project name:

```bash
npx @ijuantm/simpl-install my-project
```

Or run without a project name to be prompted for one:

```bash
npx @ijuantm/simpl-install
```

The installer will:

1. Download the latest framework version
2. Create a new project directory
3. Set up all necessary files and folders

### Get Help

```bash
npx @ijuantm/simpl-install --help
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
npx @ijuantm/simpl-addon --list
```

## Requirements

- **Node.js**: >= 22.x.x
- **PHP**: >= 8.5.x
- **Composer**: Latest version
