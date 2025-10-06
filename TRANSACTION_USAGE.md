# MongoDB Transactions - Usage Guide

## Enabling Transactions

Transactions are **disabled by default** for safety. To enable them, set the following environment variable:

```bash
export ENABLE_MONGO_TRANSACTIONS=true
```

## How It Works

The implementation uses a feature flag pattern:

1. **Environment variable is read once** at startup (line 91 in `MongoClientInterface.ts`)
2. **Value is stored** in the `useTransactions` instance property (line 303)
3. **Base methods automatically switch** between legacy and transaction implementations

### Affected Methods

When `ENABLE_MONGO_TRANSACTIONS=true`, these methods use transactions:

| Base Method | Transaction Implementation | Legacy Implementation |
|-------------|---------------------------|----------------------|
| `putObjectVerCase1()` | `putObjectVerCase1WithTransaction()` | `putObjectVerCase1Legacy()` |
| `internalDeleteObject()` | `internalDeleteObjectWithTransaction()` | `internalDeleteObjectLegacy()` |
| `putObjectNoVer()` | `putObjectNoVerWithTransaction()` | `putObjectNoVerLegacy()` |
| `putObjectNoVerWithOplogUpdate()` | `putObjectNoVerWithOplogUpdateWithTransaction()` | `putObjectNoVerWithOplogUpdateLegacy()` |

### Code Example

The switch happens automatically in the base methods:

```typescript
putObjectVerCase1(...) {
    if (this.useTransactions) {
        return this.putObjectVerCase1WithTransaction(...);
    }
    return this.putObjectVerCase1Legacy(...);
}
```

## Deployment Scenarios

### Development / Testing

```bash
# Enable transactions for local testing
export ENABLE_MONGO_TRANSACTIONS=true
npm start
```

### Staging

```bash
# Enable for gradual rollout
export ENABLE_MONGO_TRANSACTIONS=true
docker-compose up -d
```

### Production - Per Service

```yaml
# docker-compose.yml
services:
  cloudserver-1:
    environment:
      - ENABLE_MONGO_TRANSACTIONS=true
  cloudserver-2:
    environment:
      - ENABLE_MONGO_TRANSACTIONS=false  # Keep some instances as fallback
```

### Production - Feature Flag

```javascript
// In your deployment configuration
const ENABLE_TRANSACTIONS = process.env.FEATURE_FLAG_TRANSACTIONS === 'true';

if (ENABLE_TRANSACTIONS) {
    process.env.ENABLE_MONGO_TRANSACTIONS = 'true';
}
```

## Verification

### Check if Transactions are Enabled

Look for this log message at startup:

```
MongoDB transactions enabled via ENABLE_MONGO_TRANSACTIONS=true
```

### Monitor Transaction Usage

Add metrics to track which implementation is being used:

```javascript
// In your monitoring setup
if (mongoClient.useTransactions) {
    statsd.increment('arsenal.transactions.enabled');
} else {
    statsd.increment('arsenal.transactions.disabled');
}
```

## Performance Testing

### Test with Transactions Disabled (Baseline)

```bash
export ENABLE_MONGO_TRANSACTIONS=false
npm run benchmark -- --test PUT_GET_DELETE
```

### Test with Transactions Enabled

```bash
export ENABLE_MONGO_TRANSACTIONS=true
npm run benchmark -- --test PUT_GET_DELETE
```

### Compare Results

Look for differences in:
- **Latency**: p50, p95, p99 response times
- **Throughput**: operations per second
- **Error rates**: conflicts, retries, failures
- **Resource usage**: CPU, memory, MongoDB connections

## Rollback Strategy

If issues occur in production:

### Immediate Rollback

```bash
# Restart with transactions disabled
export ENABLE_MONGO_TRANSACTIONS=false
systemctl restart cloudserver
```

### Gradual Rollback

```bash
# Disable on one instance at a time
# Monitor for improvement
# Continue if metrics improve
```

## MongoDB Requirements

Transactions **will fail** if MongoDB is not properly configured:

### Required Configuration

- ✅ MongoDB 4.0+ (4.2+ recommended)
- ✅ Replica set deployment (not standalone)
- ✅ Write concern: `majority`
- ✅ Read concern: `local` or `snapshot`

### Verify MongoDB Configuration

```javascript
// Check if replica set is configured
db.hello().setName  // Should return replica set name

// Check write concern
db.getWriteConcernSettings()  // Should show majority

// Check MongoDB version
db.version()  // Should be >= 4.0
```

## Troubleshooting

### Error: "Transaction numbers are only allowed on a replica set member or mongos"

**Cause**: MongoDB is running in standalone mode

**Fix**: Convert to replica set or disable transactions:
```bash
export ENABLE_MONGO_TRANSACTIONS=false
```

### Error: "WriteConflict error"

**Cause**: High contention on same documents (expected, MongoDB will retry)

**Action**: Monitor retry rates. If excessive:
1. Check if multiple clients are updating same keys
2. Consider disabling transactions for that workload
3. Investigate application-level locking

### Performance Degradation

**Symptoms**: Increased latency, reduced throughput

**Actions**:
1. Check MongoDB logs for transaction timeouts
2. Monitor transaction retry rates
3. Compare metrics with transactions disabled
4. Consider selective enablement (only for specific buckets/operations)

## Advanced: Selective Enablement

For fine-grained control, you can modify the code to enable transactions selectively:

```typescript
// In MongoClientInterface constructor
this.useTransactions = ENABLE_MONGO_TRANSACTIONS && 
    !this.isLocationTransient(bucketName);  // Disable for transient buckets

// Or based on bucket attributes
this.useTransactions = ENABLE_MONGO_TRANSACTIONS && 
    bucketInfo.enableTransactions === true;
```

## Environment Variable Summary

| Variable | Default | Values | Description |
|----------|---------|--------|-------------|
| `ENABLE_MONGO_TRANSACTIONS` | `false` | `true`, `false` | Master switch for all transaction implementations |

## Next Steps

1. **Benchmark**: Test performance with transactions on/off
2. **Staging**: Enable in staging for 24-48 hours
3. **Canary**: Enable on 10% of production instances
4. **Monitor**: Watch for errors, latency, throughput
5. **Scale**: Gradually increase percentage
6. **Stabilize**: Keep running for 1 week
7. **Default**: Change default to `true` if stable

## Support

If you encounter issues:

1. Collect logs with transaction errors
2. Capture MongoDB metrics during incident
3. Document steps to reproduce
4. Include environment configuration
5. Note MongoDB version and replica set topology

