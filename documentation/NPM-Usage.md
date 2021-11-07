# NPM #

NPM Usage, Reference, & Setup(s)

## Table of Contents ##

- [**Usage & Reference**](#npm)
    - [*Package Registries*](#Registries)
        - [Public Registry Setup](#public-setup)
        - [Private Registry Setup](#private-setup)
    - [*CI Usage & Deployable(s)*](#ci)
        - [Shrinkwrap](#shrinkwrap)
    - [*Organizational Scope(s)*](#scopes)
        - [Overview](#overview)
        - [Installing Scopes](#installing-scoped-packages)
        - [Using Scoped Packages](#requiring-scoped-packages)

## Registries ##

### Public Setup ###

```bash
npm adduser --registry "https://registry.npmjs.com"
npm login --scope "@cloud-technology"
npm publish --access "public"
```

### Private Setup ###

```bash
npm config set "@cloud-technology:registry" "https://gitlab.cloud-technology.io/api/v4/packages/npm/" --location "project"
npm config set -- "//gitlab.cloud-technology.io/api/v4/packages/npm/:_authToken" "[Personal-Access-Token]" --location "user"
```

## CI ##

```npm
npm ci
```

The `npm ci` command is similar to `npm install`, except it's meant to be used in automated environments such as test platforms, continuous integration, and deployment(s) -- or any situation where a clean installation of `node_modules`
, `pnp`, `.yarn`, or other dependencies is desired.

`npm ci` will be significantly faster when there is a `package-lock.json` or
`npm-shrinkwrap.json` file; or The `node_modules` folder is missing or empty.

In short, the main differences between using `npm install` and `npm ci` are:

- The project must have an existing `package-lock.json` or `npm-shrinkwrap.json`.
- If dependencies in the package lock do not match those in `package.json`, `npm ci` will exit with an error, instead of updating the package lock.
- `npm ci` can only install entire projects at a time: **individual dependencies cannot be added via `npm ci`**.
- If `node_modules` is already present, it will be automatically removed before
  `npm ci` begins its install. It will never write to `package.json` or any of the package-locks: **installs are essentially frozen**.

### Shrinkwrap ###

```npm
npm shrinkwrap
```

The shrinkwrap command repurposes `package-lock.json` into a publishable `npm-shrinkwrap.json`. The file created and updated by this command will then take precedence over any other existing or future `package-lock.json` files.

#### `package-lock.json` vs `npm-shrinkwrap.json` ####

Both files share the same format, and perform similar functions in the root of a project.

The difference is that `package-lock.json` cannot be published, and it will be ignored if found in any place other than the root project.

In contrast, `npm-shrinkwrap.json` allows publication, and defines the dependency tree from the point encountered.

If both `package-lock.json` and `npm-shrinkwrap.json` are present in the root of a project, `npm-shrinkwrap.json` will take precedence and
`package-lock.json` will be ignored.

## Scope(s) ##

### Overview ###

All npm packages have a name. Some package names also have a scope. A scope follows the usual rules for package names. When used in package names, scopes are preceded by an `@` symbol and followed by a slash, e.g. `@scope/package`.

Scopes are a way of grouping related packages together, and also affect a few things about the way npm treats the package.

### Installing Scoped Packages ###

Scoped packages are installed to a sub-folder of the regular installation folder, e.g. if your other packages are installed in `node_modules/package`, scoped modules will be installed in `node_modules/@organization/package`. The scope
folder (`@organization`) is simply the name of the scope preceded by an `@` symbol, and can contain any number of scoped packages.

### Requiring Scoped Packages ###

Because scoped packages are installed into a scope folder, users have to include the name of the scope when requiring them in code, e.g.

```javascript
require("@organization/package");
```
