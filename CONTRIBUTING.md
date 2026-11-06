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

Prettier formatting of the whole repository is checked in CI, including
`package.json`. Since `yarn add`/`yarn remove` may rewrite `package.json` with
2-space indentation, run formatting before pushing:

```bash
yarn run prettier --write .
```
