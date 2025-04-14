# MongoDB Dual Client Mode

## Overview

The MongoDB Dual Client mode is designed to optimize read-heavy workloads in a Primary-Secondary-with-Secondaries (PSS) architecture. It creates two MongoDB client connections:

1. **Primary client**: Used for all write operations, with configured readPreference
2. **Secondary client**: Used for read operations, with `secondaryPreferred` readPreference

This approach helps distribute the load between primary and secondary MongoDB instances for better performance and scalability.

## Configuration

Dual client mode is controlled through the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DUAL_CLIENT_ENABLED` | Enable or disable dual client mode | `false` |
| `SECONDARY_MAX_STALENESS` | Maximum staleness in seconds for reads from secondaries | `2` |

### Example

```bash
# Enable dual client mode
export DUAL_CLIENT_ENABLED=true

# Allow secondaries to be up to 5 seconds behind primary
export SECONDARY_MAX_STALENESS=5
```

## How It Works

When dual client mode is enabled:

1. The system establishes two connections during startup:
   - A primary connection using the configured readPreference
   - A secondary connection using secondaryPreferred with maxStalenessSeconds

2. Read operations use the secondary connection when available:
   - `getObject`, `getBucketAttributes`, `listObject`, etc.
   - Falls back to the primary connection if the secondary is unavailable

3. Write operations always use the primary connection:
   - `putObject`, `createBucket`, `deleteObject`, etc.

## Advantages

- Reduced load on the primary MongoDB instance
- Better utilization of secondary replicas
- Improved read performance for high-throughput workloads
- Automatic failover to primary if secondaries are unavailable

## Health Checks

The health check system monitors both connections:
- Reports healthy if all connections are up
- Includes a warning if the primary is up but secondary is down
- Reports unhealthy if the primary connection is down

## Notes

In a write-majority architecture (where we always use `majority` as writeConcern), secondaries are kept up to date with the primary, making them reliable for read operations with a small staleness window.

Secondary reads might return slightly stale data (up to the configured `SECONDARY_MAX_STALENESS` seconds), which is acceptable for most read operations. 