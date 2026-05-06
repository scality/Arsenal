# Contributing rules

Please follow the
[Contributing Guidelines](https://github.com/scality/Guidelines/blob/master/CONTRIBUTING.md).

## Development

To set up your development environment, run:

```bash
yarn install
yarn dev
```

`dev` will watch for changes and recompile the code automatically with nodemon.

### Formatting

Prettier is enforced in CI for changed files, including `package.json`.
Since `yarn add`/`yarn remove` may rewrite `package.json` with 2-space
indentation, run formatting before pushing dependency changes:

```bash
yarn run prettier --write .
```

When reviewing PRs with indentation-only changes, enable **Hide whitespace** in
the GitHub file diff view to make functional changes easier to spot.
