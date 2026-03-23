# arsenal

This is **Scality's shared utilities library** for S3 infrastructure
components. It is a TypeScript/Node.js library providing foundational
modules used across CloudServer, Backbeat, and other S3 platform
services. It contains:

- Algorithms library: listing, caching, streaming, sorting (`lib/algos/`)
- AWS v2/v4 authentication and Vault integration (`lib/auth/`)
- Data models: BucketInfo, ObjectMD, ARN, and others (`lib/models/`)
- S3 middleware: tagging, legal hold, lifecycle, conditional headers (`lib/s3middleware/`)
- Storage backends: metadata (MongoDB, BucketClient, file)
  and data (file, AWS, Azure, GCP) (`lib/storage/`)
- IAM policy evaluation (`lib/policyEvaluator/`)
- S3 route definitions (`lib/s3routes/`)
- Object versioning logic (`lib/versioning/`)
- Custom error types with proxy-based `.is` checking (`lib/errors/`)
- Git-based internal deps: werelogs, sproxydclient, httpagent

## Tech stack

- **Language:** TypeScript (compiled to ES2021/CommonJS)
- **Runtime:** Node.js >= 20
- **Build:** tsc + Babel
- **Test:** Jest + ts-jest, Sinon, mongodb-memory-server
- **Lint:** ESLint 9 flat config with @scality/eslint-config-scality
- **CI:** GitHub Actions (lint, unit tests, functional tests, coverage)

## Key commands

```bash
yarn install          # Install deps and build (prepare hook)
yarn test             # Run Jest unit tests
yarn lint             # Run ESLint
yarn build            # Compile TypeScript
```

## Conventions

- All imports at the top of the file, never inside functions or blocks
- Strict TypeScript (`strict: true`)
- Test files use `.spec.js` or `.spec.ts` suffix
- Custom `ArsenalError` with `error.is.NoSuchEntity` proxy pattern
- Metadata model version tracking (`mdModelVersion = 7`)
