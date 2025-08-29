import { Collection, AnyBulkWriteOperation, BulkWriteResult } from 'mongodb';
import * as werelogs from 'werelogs';
import { ArsenalCallback } from '../../../types';

/**
 * Types of MongoDB operations that can be batched
 */
export type MongoOperationType = 
    | 'find' 
    | 'findOne' 
    | 'insertOne' 
    | 'updateOne' 
    | 'replaceOne' 
    | 'deleteOne' 
    | 'bulkWrite'
    | 'aggregate'
    | 'countDocuments'
    | 'distinct';

/**
 * Configuration for the MongoDB operations wrapper
 */
export interface MongoWrapperConfig {
    /** Delay in ms before flushing batches (0 = disabled) */
    batchDelayMs: number;
    /** Maximum number of operations per batch */
    maxBatchSize: number;
    /** Logger instance */
    logger: werelogs.Logger;
    /** Whether to enable batching for read operations */
    enableReadBatching: boolean;
    /** Whether to enable batching for write operations */
    enableWriteBatching: boolean;
    /** 
     * Minimum read operations per second threshold to enable batching dynamically.
     * This threshold should be configured by the operator based on:
     * - Number of CloudServer replicas in the deployment
     * - Expected read load patterns  
     * - Network latency characteristics
     * When read ops/sec exceeds this threshold, batching activates to reduce MongoDB load.
     * Set to 0 to disable dynamic read batching.
     */
    readOpsPerSecThreshold: number;
    /** 
     * Minimum write operations per second threshold to enable batching dynamically.
     * This threshold should be configured by the operator based on:
     * - Number of CloudServer replicas in the deployment
     * - Expected write load patterns
     * - Network latency characteristics  
     * When write ops/sec exceeds this threshold, batching activates to reduce MongoDB load.
     * Set to 0 to disable dynamic write batching.
     */
    writeOpsPerSecThreshold: number;
}

/**
 * Represents a single operation in the batch queue
 */
interface BatchedOperation<T = any> {
    /** The operation type */
    type: MongoOperationType;
    /** The operation parameters */
    params: any[];
    /** The callback to execute when operation completes */
    callback: ArsenalCallback<T>;
    /** The collection to execute on */
    collection: Collection<any>;
    /** Additional context for debugging */
    context?: {
        bucketName?: string;
        objName?: string;
        operationId?: string;
        log?: werelogs.Logger;
    };
    /** The base function to call in case of fallback */
    baseCall: () => Promise<T>;
}

/**
 * Represents a batch queue for a specific collection
 */
interface BatchQueue {
    /** Write operations that can be batched together */
    writeOps: BatchedOperation[];
    /** Read operations (for potential future batching) */
    readOps: BatchedOperation[];
    /** Timer for flushing the batch */
    timer: NodeJS.Timeout | null;
    /** The collection this queue belongs to */
    collection: Collection<any>;
}

/**
 * Operations per second tracking
 */
interface OpsPerSecTracker {
    /** Window start time */
    windowStart: number;
    /** Operations count in current window */
    opsCount: number;
    /** Current ops per second */
    currentOpsPerSec: number;
    /** Window duration in milliseconds */
    windowDurationMs: number;
}

/**
 * A static wrapper class that can batch or directly execute MongoDB operations
 * 
 * This class provides a unified interface for all MongoDB operations with the ability to:
 * - Execute operations immediately when batching is disabled or thresholds not met
 * - Batch compatible operations when batching is enabled and thresholds are exceeded
 * - Fallback to direct execution on errors
 * - Handle different operation types (reads vs writes)
 * - Track operations per second to enable dynamic batching
 */
export class MongoOperationsWrapper {
    private static instances: Map<string, MongoOperationsWrapper> = new Map();
    private config: MongoWrapperConfig;
    private batchQueues: Map<string, BatchQueue> = new Map();
    private readOpsTracker: OpsPerSecTracker;
    private writeOpsTracker: OpsPerSecTracker;

    private constructor(config: MongoWrapperConfig) {
        this.config = config;
        this.readOpsTracker = {
            windowStart: Date.now(),
            opsCount: 0,
            currentOpsPerSec: 0,
            windowDurationMs: 1000 // 1 second window
        };
        this.writeOpsTracker = {
            windowStart: Date.now(),
            opsCount: 0,
            currentOpsPerSec: 0,
            windowDurationMs: 1000 // 1 second window
        };
    }

    /**
     * Get or create a wrapper instance for a specific configuration
     */
    private static getInstance(instanceId: string, config: MongoWrapperConfig): MongoOperationsWrapper {
        if (!MongoOperationsWrapper.instances.has(instanceId)) {
            MongoOperationsWrapper.instances.set(instanceId, new MongoOperationsWrapper(config));
        }
        return MongoOperationsWrapper.instances.get(instanceId)!;
    }

    /**
     * Execute a MongoDB find operation with optional batching
     */
    public static find<T = any>(
        instanceId: string,
        config: MongoWrapperConfig,
        collection: Collection<any>,
        filter: any,
        options: any,
        callback: ArsenalCallback<T>,
        context?: {
            bucketName?: string;
            objName?: string;
            operationId?: string;
            log?: werelogs.Logger;
        }
    ): void {
        const baseCall = async (): Promise<T> => {
            const cursor = collection.find(filter, options);
            const results = await cursor.toArray();
            return results as T;
        };

        MongoOperationsWrapper.execute(
            instanceId,
            config,
            collection,
            'find',
            [filter, options],
            callback,
            context,
            baseCall
        );
    }

    /**
     * Execute a MongoDB findOne operation with optional batching
     */
    public static findOne<T = any>(
        instanceId: string,
        config: MongoWrapperConfig,
        collection: Collection<any>,
        filter: any,
        options: any,
        callback: ArsenalCallback<T>,
        context?: {
            bucketName?: string;
            objName?: string;
            operationId?: string;
            log?: werelogs.Logger;
        }
    ): void {
        const baseCall = async (): Promise<T> => {
            return collection.findOne(filter, options) as Promise<T>;
        };

        MongoOperationsWrapper.execute(
            instanceId,
            config,
            collection,
            'findOne',
            [filter, options],
            callback,
            context,
            baseCall
        );
    }

    /**
     * Execute a MongoDB insertOne operation with optional batching
     */
    public static insertOne<T = any>(
        instanceId: string,
        config: MongoWrapperConfig,
        collection: Collection<any>,
        document: any,
        options: any,
        callback: ArsenalCallback<T>,
        context?: {
            bucketName?: string;
            objName?: string;
            operationId?: string;
            log?: werelogs.Logger;
        }
    ): void {
        const baseCall = async (): Promise<T> => {
            return collection.insertOne(document, options) as Promise<T>;
        };

        MongoOperationsWrapper.execute(
            instanceId,
            config,
            collection,
            'insertOne',
            [document, options],
            callback,
            context,
            baseCall
        );
    }

    /**
     * Execute a MongoDB updateOne operation with optional batching
     */
    public static updateOne<T = any>(
        instanceId: string,
        config: MongoWrapperConfig,
        collection: Collection<any>,
        filter: any,
        update: any,
        options: any,
        callback: ArsenalCallback<T>,
        context?: {
            bucketName?: string;
            objName?: string;
            operationId?: string;
            log?: werelogs.Logger;
        }
    ): void {
        const baseCall = async (): Promise<T> => {
            return collection.updateOne(filter, update, options) as Promise<T>;
        };

        MongoOperationsWrapper.execute(
            instanceId,
            config,
            collection,
            'updateOne',
            [filter, update, options],
            callback,
            context,
            baseCall
        );
    }

    /**
     * Execute a MongoDB replaceOne operation with optional batching
     */
    public static replaceOne<T = any>(
        instanceId: string,
        config: MongoWrapperConfig,
        collection: Collection<any>,
        filter: any,
        replacement: any,
        options: any,
        callback: ArsenalCallback<T>,
        context?: {
            bucketName?: string;
            objName?: string;
            operationId?: string;
            log?: werelogs.Logger;
        }
    ): void {
        const baseCall = async (): Promise<T> => {
            return collection.replaceOne(filter, replacement, options) as Promise<T>;
        };

        MongoOperationsWrapper.execute(
            instanceId,
            config,
            collection,
            'replaceOne',
            [filter, replacement, options],
            callback,
            context,
            baseCall
        );
    }

    /**
     * Execute a MongoDB deleteOne operation with optional batching
     */
    public static deleteOne<T = any>(
        instanceId: string,
        config: MongoWrapperConfig,
        collection: Collection<any>,
        filter: any,
        options: any,
        callback: ArsenalCallback<T>,
        context?: {
            bucketName?: string;
            objName?: string;
            operationId?: string;
            log?: werelogs.Logger;
        }
    ): void {
        const baseCall = async (): Promise<T> => {
            return collection.deleteOne(filter, options) as Promise<T>;
        };

        MongoOperationsWrapper.execute(
            instanceId,
            config,
            collection,
            'deleteOne',
            [filter, options],
            callback,
            context,
            baseCall
        );
    }

    /**
     * Execute a MongoDB bulkWrite operation
     */
    public static bulkWrite<T = any>(
        instanceId: string,
        config: MongoWrapperConfig,
        collection: Collection<any>,
        operations: AnyBulkWriteOperation<any>[],
        options: any,
        callback: ArsenalCallback<T>,
        context?: {
            bucketName?: string;
            objName?: string;
            operationId?: string;
            log?: werelogs.Logger;
        }
    ): void {
        const baseCall = async (): Promise<T> => {
            return collection.bulkWrite(operations, options) as Promise<T>;
        };

        // BulkWrite is always executed directly (no double-batching)
        MongoOperationsWrapper.executeDirectly(baseCall, callback, context, config.logger);
    }

    /**
     * Core execution method - determines whether to batch or execute directly
     */
    private static execute<T>(
        instanceId: string,
        config: MongoWrapperConfig,
        collection: Collection<any>,
        operation: MongoOperationType,
        params: any[],
        callback: ArsenalCallback<T>,
        context?: {
            bucketName?: string;
            objName?: string;
            operationId?: string;
            log?: werelogs.Logger;
        },
        baseCall?: () => Promise<T>
    ): void {
        const wrapper = MongoOperationsWrapper.getInstance(instanceId, config);
        const log = context?.log || config.logger;

        // Create a base call function if not provided
        const defaultBaseCall = async (): Promise<T> => {
            return MongoOperationsWrapper.executeDirectlySync<T>(collection, operation, params);
        };

        const actualBaseCall = baseCall || defaultBaseCall;

        // Update operations tracking
        const isWrite = MongoOperationsWrapper.isWriteOperation(operation);
        wrapper.updateOpsTracking(isWrite);

        // If batching is disabled, execute directly
        if (config.batchDelayMs <= 0) {
            log.debug('Executing MongoDB operation directly (batching disabled)', {
                operation,
                collection: collection.collectionName,
                ...context
            });
            MongoOperationsWrapper.executeDirectly(actualBaseCall, callback, context, config.logger);
            return;
        }

        // Check if this operation type can be batched
        const canBatch = MongoOperationsWrapper.canOperationBeBatched(operation);
        if (!canBatch) {
            log.debug('Executing MongoDB operation directly (not batchable)', {
                operation,
                collection: collection.collectionName,
                ...context
            });
            MongoOperationsWrapper.executeDirectly(actualBaseCall, callback, context, config.logger);
            return;
        }

        // Check if operation should be batched based on configuration and thresholds
        const shouldBatch = wrapper.shouldEnableBatching(isWrite);
        
        // Always log batching decisions for debugging
        log.info('MongoOperationsWrapper: Batching decision', {
            operation,
            isWrite,
            collection: collection.collectionName,
            shouldBatch,
            readOpsPerSec: wrapper.readOpsTracker.currentOpsPerSec,
            writeOpsPerSec: wrapper.writeOpsTracker.currentOpsPerSec,
            readThreshold: config.readOpsPerSecThreshold,
            writeThreshold: config.writeOpsPerSecThreshold,
            enableReadBatching: config.enableReadBatching,
            enableWriteBatching: config.enableWriteBatching,
            batchDelayMs: config.batchDelayMs,
            ...context
        });
        
        if (!shouldBatch) {
            MongoOperationsWrapper.executeDirectly(actualBaseCall, callback, context, config.logger);
            return;
        }

        // Add to batch
        wrapper.addToBatch<T>(collection, operation, params, callback, context, actualBaseCall);
    }

    /**
     * Execute an operation directly without batching
     */
    private static async executeDirectlySync<T>(
        collection: Collection<any>,
        operation: MongoOperationType,
        params: any[]
    ): Promise<T> {
        const collectionMethod = (collection as any)[operation];
        if (typeof collectionMethod !== 'function') {
            throw new Error(`Operation ${operation} is not supported on collection`);
        }

        return collectionMethod.apply(collection, params);
    }

    /**
     * Execute a base call with proper error handling
     */
    private static executeDirectly<T>(
        baseCall: () => Promise<T>,
        callback: ArsenalCallback<T>,
        context?: {
            bucketName?: string;
            objName?: string;
            operationId?: string;
            log?: werelogs.Logger;
        },
        logger?: werelogs.Logger
    ): void {
        const log = context?.log || logger;
        
        baseCall()
            .then(result => callback(null, result))
            .catch(error => {
                if (log) {
                    log.error('MongoDB operation failed', {
                        error: error.message,
                        ...context
                    });
                }
                callback(error);
            });
    }

    /**
     * Update operations per second tracking
     */
    private updateOpsTracking(isWrite: boolean): void {
        const tracker = isWrite ? this.writeOpsTracker : this.readOpsTracker;
        const now = Date.now();
        
        // Reset window if expired
        if (now - tracker.windowStart >= tracker.windowDurationMs) {
            tracker.currentOpsPerSec = Math.round(tracker.opsCount * (1000 / tracker.windowDurationMs));
            tracker.opsCount = 1;
            tracker.windowStart = now;
        } else {
            tracker.opsCount++;
        }
    }

    /**
     * Determine if batching should be enabled based on current operations per second
     */
    private shouldEnableBatching(isWrite: boolean): boolean {
        const tracker = isWrite ? this.writeOpsTracker : this.readOpsTracker;
        const threshold = isWrite ? this.config.writeOpsPerSecThreshold : this.config.readOpsPerSecThreshold;
        const enabledConfig = isWrite ? this.config.enableWriteBatching : this.config.enableReadBatching;
        
        // Always enable batching if feature is enabled and threshold is 0 (no threshold)
        if (enabledConfig && threshold === 0) {
            return true;
        }
        
        // Enable batching if feature is enabled and current ops/sec meets threshold
        return enabledConfig && tracker.currentOpsPerSec >= threshold;
    }

    /**
     * Check if an operation can be batched
     */
    private static canOperationBeBatched(operation: MongoOperationType): boolean {
        // Currently only write operations that can be converted to bulkWrite operations can be batched
        const batchableOps: MongoOperationType[] = ['insertOne', 'updateOne', 'replaceOne', 'deleteOne'];
        return batchableOps.includes(operation);
    }

    /**
     * Check if an operation is a write operation
     */
    private static isWriteOperation(operation: MongoOperationType): boolean {
        const writeOps: MongoOperationType[] = ['insertOne', 'updateOne', 'replaceOne', 'deleteOne', 'bulkWrite'];
        return writeOps.includes(operation);
    }

    /**
     * Add an operation to the batch queue
     */
    private addToBatch<T>(
        collection: Collection<any>,
        operation: MongoOperationType,
        params: any[],
        callback: ArsenalCallback<T>,
        context?: {
            bucketName?: string;
            objName?: string;
            operationId?: string;
            log?: werelogs.Logger;
        },
        baseCall?: () => Promise<T>
    ): void {
        const collectionName = collection.collectionName;
        const log = context?.log || this.config.logger;

        if (!this.batchQueues.has(collectionName)) {
            this.batchQueues.set(collectionName, {
                writeOps: [],
                readOps: [],
                timer: null,
                collection
            });
        }

        const batchQueue = this.batchQueues.get(collectionName)!;
        const isWrite = MongoOperationsWrapper.isWriteOperation(operation);

        const batchedOp: BatchedOperation<T> = {
            type: operation,
            params,
            callback,
            collection,
            context,
            baseCall: baseCall || (() => MongoOperationsWrapper.executeDirectlySync<T>(collection, operation, params))
        };

        // Add to appropriate queue
        if (isWrite) {
            batchQueue.writeOps.push(batchedOp);
        } else {
            batchQueue.readOps.push(batchedOp);
        }

        log.debug('Added operation to batch queue', {
            operation,
            collection: collectionName,
            queueSize: isWrite ? batchQueue.writeOps.length : batchQueue.readOps.length,
            isWrite,
            readOpsPerSec: this.readOpsTracker.currentOpsPerSec,
            writeOpsPerSec: this.writeOpsTracker.currentOpsPerSec,
            ...context
        });

        // Check if we should flush immediately due to batch size limit
        const totalOps = batchQueue.writeOps.length + batchQueue.readOps.length;
        if (totalOps >= this.config.maxBatchSize) {
            log.debug('Flushing batch due to size limit', {
                collection: collectionName,
                totalOps,
                maxBatchSize: this.config.maxBatchSize
            });
            this.flushBatch(collectionName);
            return;
        }

        // Start timer if this is the first operation in the queue
        if (batchQueue.timer === null) {
            batchQueue.timer = setTimeout(() => {
                this.flushBatch(collectionName);
            }, this.config.batchDelayMs);
        }
    }

    /**
     * Flush a batch queue and execute all queued operations
     */
    private flushBatch(collectionName: string): void {
        const batchQueue = this.batchQueues.get(collectionName);
        if (!batchQueue || (batchQueue.writeOps.length === 0 && batchQueue.readOps.length === 0)) {
            return;
        }

        const log = this.config.logger;
        log.info('MongoOperationsWrapper: Flushing batch', {
            collection: collectionName,
            writeOps: batchQueue.writeOps.length,
            readOps: batchQueue.readOps.length,
            totalOps: batchQueue.writeOps.length + batchQueue.readOps.length
        });

        // Clear the timer and reset the queue
        if (batchQueue.timer) {
            clearTimeout(batchQueue.timer);
            batchQueue.timer = null;
        }

        const { writeOps, readOps, collection } = batchQueue;
        this.batchQueues.delete(collectionName);

        // Execute write operations as a bulk write if possible
        if (writeOps.length > 0) {
            this.executeBatchedWrites(writeOps, collection);
        }

        // Execute read operations individually (for now)
        if (readOps.length > 0) {
            this.executeBatchedReads(readOps);
        }
    }

    /**
     * Execute batched write operations using bulkWrite
     */
    private executeBatchedWrites(operations: BatchedOperation[], collection: Collection): void {
        const log = this.config.logger;
        
        try {
            // Convert individual operations to bulk operations
            const bulkOps: AnyBulkWriteOperation[] = [];
            
            for (const op of operations) {
                const bulkOp = MongoOperationsWrapper.convertToBulkOperation(op);
                if (bulkOp) {
                    bulkOps.push(bulkOp);
                }
            }

            if (bulkOps.length === 0) {
                log.warn('No valid bulk operations to execute', {
                    collection: collection.collectionName,
                    originalOpsCount: operations.length
                });
                // Fall back to individual execution
                this.fallbackToIndividualExecution(operations);
                return;
            }

            // Execute the bulk operation
            collection.bulkWrite(bulkOps, { ordered: false })
                .then((result: BulkWriteResult) => {
                    log.info('MongoOperationsWrapper: Bulk write completed successfully', {
                        collection: collection.collectionName,
                        batchSize: operations.length,
                        bulkOpsCount: bulkOps.length,
                        insertedCount: result.insertedCount,
                        modifiedCount: result.modifiedCount,
                        deletedCount: result.deletedCount,
                        upsertedCount: result.upsertedCount
                    });

                    // Call all callbacks with success
                    operations.forEach(op => {
                        op.callback(null, result as any);
                    });
                })
                .catch((error: any) => {
                    log.warn('Bulk write failed, falling back to individual execution', {
                        collection: collection.collectionName,
                        error: error.message,
                        opsCount: operations.length
                    });
                    
                    this.fallbackToIndividualExecution(operations);
                });
        } catch (error) {
            log.error('Error preparing bulk write operations', {
                collection: collection.collectionName,
                error: (error as Error).message,
                opsCount: operations.length
            });
            
            this.fallbackToIndividualExecution(operations);
        }
    }

    /**
     * Convert an individual operation to a bulk operation
     */
    private static convertToBulkOperation(op: BatchedOperation): AnyBulkWriteOperation | null {
        try {
            switch (op.type) {
                case 'insertOne':
                    return {
                        insertOne: {
                            document: op.params[0]
                        }
                    };
                case 'updateOne':
                    return {
                        updateOne: {
                            filter: op.params[0],
                            update: op.params[1],
                            upsert: op.params[2]?.upsert || false
                        }
                    };
                case 'replaceOne':
                    return {
                        replaceOne: {
                            filter: op.params[0],
                            replacement: op.params[1],
                            upsert: op.params[2]?.upsert || false
                        }
                    };
                case 'deleteOne':
                    return {
                        deleteOne: {
                            filter: op.params[0]
                        }
                    };
                default:
                    return null;
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * Execute read operations individually
     */
    private executeBatchedReads(operations: BatchedOperation[]): void {
        // For now, execute reads individually
        // Future enhancement: could use aggregation pipeline to batch some read operations
        operations.forEach(op => {
            MongoOperationsWrapper.executeDirectly(op.baseCall, op.callback, op.context, this.config.logger);
        });
    }

    /**
     * Fall back to individual execution for failed batch operations
     */
    private fallbackToIndividualExecution(operations: BatchedOperation[]): void {
        const log = this.config.logger;
        
        operations.forEach(op => {
            log.debug('Executing operation individually as fallback', {
                operation: op.type,
                collection: op.collection.collectionName,
                context: op.context
            });
            
            MongoOperationsWrapper.executeDirectly(op.baseCall, op.callback, op.context, this.config.logger);
        });
    }

    /**
     * Flush all pending batches for a specific instance (useful for shutdown)
     */
    public static flushAllBatches(instanceId: string): void {
        const instance = MongoOperationsWrapper.instances.get(instanceId);
        if (instance) {
            const collectionNames = Array.from(instance.batchQueues.keys());
            collectionNames.forEach(collectionName => {
                instance.flushBatch(collectionName);
            });
        }
    }

    /**
     * Get statistics about current batch queues for a specific instance
     */
    public static getBatchStatistics(instanceId: string): { 
        collections: { [collectionName: string]: { writeOps: number; readOps: number } };
        readOpsPerSec: number;
        writeOpsPerSec: number;
    } {
        const instance = MongoOperationsWrapper.instances.get(instanceId);
        if (!instance) {
            return { collections: {}, readOpsPerSec: 0, writeOpsPerSec: 0 };
        }

        const collections: { [collectionName: string]: { writeOps: number; readOps: number } } = {};
        
        instance.batchQueues.forEach((queue, collectionName) => {
            collections[collectionName] = {
                writeOps: queue.writeOps.length,
                readOps: queue.readOps.length
            };
        });
        
        return {
            collections,
            readOpsPerSec: instance.readOpsTracker.currentOpsPerSec,
            writeOpsPerSec: instance.writeOpsTracker.currentOpsPerSec
        };
    }
}