# MongoDB Transaction Implementation for Arsenal

This document describes the transaction-enabled methods implemented in `MongoClientInterface` to eliminate race conditions and improve consistency.

## Overview

Five new transaction-enabled methods have been added to `MongoClientInterface.ts` to handle the "Easy" driver-level improvements identified in the transaction analysis. These methods use MongoDB's native transaction support (available since MongoDB 4.0+) to provide ACID guarantees.

## Implemented Methods

### 1. `putObjectVerCase1WithTransaction`

**Purpose**: Versioned PUT with automatic conflict resolution

**Replaces**: `putObjectVerCase1` retry logic

**Benefits**:
- Eliminates manual retry logic with `process.nextTick`
- Atomic insertion of version document and master update
- Automatic rollback on conflict
- Simpler code, easier to maintain

**Usage**:
```typescript
await mongoClientInterface.putObjectVerCase1WithTransaction(
    collection,
    bucketName,
    objectName,
    objectMetadata,
    params,
    logger,
    callback
);
```

### 2. `internalDeleteObjectWithTransaction`

**Purpose**: Delete object with oplog update in single transaction

**Replaces**: Two-phase delete pattern in `internalDeleteObject`

**Benefits**:
- Eliminates two round trips (findOneAndUpdate + bulkWrite)
- Single atomic operation: find, update for oplog, delete
- No intermediate "soft deleted" state
- Prevents reads of deleted objects during transition

**Usage**:
```typescript
await mongoClientInterface.internalDeleteObjectWithTransaction(
    collection,
    bucketName,
    objectKey,
    filter,
    params,
    logger,
    callback,
    originOp
);
```

### 3. `internalPutObjectWithTransaction`

**Purpose**: Overwrite object with oplog update in single transaction

**Replaces**: Two-phase PUT pattern in `internalPutObject`

**Benefits**:
- Eliminates two sequential updates (delete flag + new object)
- Single atomic operation for overwrite
- No intermediate state with delete flag
- Consistent behavior during concurrent operations

**Usage**:
```typescript
await mongoClientInterface.internalPutObjectWithTransaction(
    collection,
    bucketName,
    objectName,
    newMetadata,
    params,
    logger,
    callback
);
```

### 4. `putObjectNoVerWithTransaction`

**Purpose**: PUT object without versioning with atomic conflict detection

**Replaces**: Simple upsert in `putObjectNoVer`

**Benefits**:
- Prevents concurrent PUT race conditions
- Snapshot isolation ensures consistent reads during operation
- Automatic conflict detection and retry by MongoDB

**Usage**:
```typescript
await mongoClientInterface.putObjectNoVerWithTransaction(
    collection,
    bucketName,
    objectName,
    metadata,
    params,
    logger,
    callback
);
```

### 5. `putObjectNoVerWithOplogUpdateWithTransaction`

**Purpose**: PUT without versioning with oplog update, atomic

**Replaces**: Two-phase pattern in `putObjectNoVerWithOplogUpdate`

**Benefits**:
- Single transaction for find, delete (if exists), and put
- Oplog correctly captures old and new values
- No race window between operations
- Handles both create and overwrite cases atomically

**Usage**:
```typescript
await mongoClientInterface.putObjectNoVerWithOplogUpdateWithTransaction(
    collection,
    bucketName,
    objectName,
    metadata,
    params,
    logger,
    callback
);
```

## Technical Details

### Session Management

All methods follow this pattern:
1. Start a session: `const session = this.client!.startSession()`
2. Execute operations in transaction: `await session.withTransaction(async () => { ... })`
3. End session in finally block: `await session.endSession()`

### Error Handling

- MongoDB transaction errors are caught and logged
- Sessions are always closed, even on error
- Arsenal errors (like `NoSuchKey`) are preserved
- Generic errors are converted to `InternalError`

### Snapshot Isolation

All reads within a transaction see a consistent snapshot of the database:
- No dirty reads
- No non-repeatable reads
- No phantom reads

### Automatic Retry

MongoDB's `session.withTransaction()` automatically retries transient errors like:
- Write conflicts (concurrent updates to same document)
- Temporary network issues
- Transient replication lag

## Performance Considerations

### When transactions are FASTER:
- **Two-phase operations**: Eliminates extra round trip
- **Retry scenarios**: MongoDB handles retries more efficiently than application code
- **High concurrency**: Snapshot isolation prevents unnecessary retries

### When transactions have overhead:
- **Simple single-document operations**: Small overhead for transaction bookkeeping
- **No contention scenarios**: Transaction guarantees not needed

### Measurement needed:
According to Francois's feedback, measure both:
1. **Normal case** (no conflicts): Is transaction overhead acceptable?
2. **High contention case** (deliberate conflicts): Are transactions more efficient than manual retries?

## MongoDB Version Requirements

- **Minimum**: MongoDB 4.0+ (multi-document transactions)
- **Recommended**: MongoDB 4.2+ (distributed transactions)
- **Replica Set**: Required (transactions don't work on standalone instances)

## Migration Strategy

These methods are **additive** - they don't replace existing methods. This allows for:

1. **Gradual migration**: Update callers one by one
2. **A/B testing**: Compare performance of old vs new
3. **Feature flags**: Enable transactions per environment
4. **Rollback safety**: Keep old methods as fallback

## Testing

Unit tests are provided in `tests/unit/storage/metadata/mongoclient/MongoClientTransactions.spec.ts`:

- Happy path scenarios
- Error handling
- Session lifecycle
- Operation atomicity verification

Run tests:
```bash
npm test -- tests/unit/storage/metadata/mongoclient/MongoClientTransactions.spec.ts
```

## Next Steps

1. **Performance benchmarking**: Measure transaction overhead vs. benefits
2. **Integration testing**: Test with real MongoDB replica set
3. **Cloudserver integration**: Update API layer to use transaction methods
4. **Monitoring**: Add metrics for transaction success/failure rates
5. **Documentation**: Update API documentation with transaction methods

## References

- [MongoDB Transactions Documentation](https://www.mongodb.com/docs/manual/core/transactions/)
- [Transaction Analysis Document](../../../current.md)
- [Race Conditions Summary](../../../RACE_CONDITIONS_SUMMARY_TABLE.md)

