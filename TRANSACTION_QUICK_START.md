# MongoDB Transactions - Quick Start

## TL;DR

```bash
# Enable transactions
export ENABLE_MONGO_TRANSACTIONS=true

# Start your service
npm start

# Look for this in logs:
# "MongoDB transactions enabled via ENABLE_MONGO_TRANSACTIONS=true"
```

## What Gets Enabled

When `ENABLE_MONGO_TRANSACTIONS=true`, these operations become atomic:

- ✅ **Versioned PUT** - No more retry logic races
- ✅ **Object DELETE** - Single atomic operation (no two-phase)
- ✅ **Object PUT overwrite** - Atomic old delete + new insert
- ✅ **Concurrent PUT (no versioning)** - Race-free overwrites
- ✅ **PUT with oplog** - Atomic old delete + new insert + oplog

## Requirements

- MongoDB 4.0+ (4.2+ recommended)
- Replica set (NOT standalone)
- Write concern: `majority`

## Quick Test

```bash
# Test with transactions OFF (baseline)
export ENABLE_MONGO_TRANSACTIONS=false
npm test

# Test with transactions ON
export ENABLE_MONGO_TRANSACTIONS=true
npm test

# Compare results
```

## Rollback

```bash
# If issues occur:
export ENABLE_MONGO_TRANSACTIONS=false
systemctl restart cloudserver
```

## Default Value

**Transactions are DISABLED by default** for safety.

Default: `ENABLE_MONGO_TRANSACTIONS=false` (or unset)

## More Info

- Technical details: See `TRANSACTION_IMPLEMENTATION.md`
- Usage guide: See `TRANSACTION_USAGE.md`
- Code: `MongoClientInterface.ts` lines 91, 303, 856, 1334, 2339

