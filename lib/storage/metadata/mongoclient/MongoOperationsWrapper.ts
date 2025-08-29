import { Collection, AnyBulkWriteOperation, BulkWriteResult } from 'mongodb';
import * as werelogs from 'werelogs';
import { ArsenalCallback } from '../../../types';
import errors from '../../../errors';

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
 * Lightweight operation representation - minimize memory footprint
 */
interface BatchedOperation<T = any> {
    /** The operation type - using enum for better performance */
    type: MongoOperationType;
    /** Flattened parameters - avoid array allocation where possible */
    filter: any;
    update?: any;
    options?: any;
    /** The callback to execute when operation completes */
    callback: ArsenalCallback<T>;
    /** Minimal context - only what's essential */
    bucketName?: string;
    objName?: string;
    /** Collection reference for fallback execution */
    collection?: Collection<any>;
}

/**
 * Optimized batch queue - focus on writes only for putObjectVerCase1
 */
interface BatchQueue {
    /** Write operations only - reads don't benefit from batching in our use case */
    writeOps: BatchedOperation[];
    /** Pre-allocated bulk operations array to avoid repeated allocations */
    bulkOps: AnyBulkWriteOperation[];
    /** Timer for flushing the batch */
    timer: NodeJS.Timeout | null;
    /** The collection this queue belongs to */
    collection: Collection<any>;
    /** Pre-allocated capacity to avoid array resizing */
    capacity: number;
}

/**
 * Object pool for frequently allocated objects to reduce GC pressure
 */
class ObjectPool {
    private static filterPool: any[] = [];
    private static updatePool: any[] = [];
    private static optionsPool: any[] = [];

    static getFilter(): any {
        return this.filterPool.pop() || {};
    }

    static returnFilter(obj: any): void {
        // Clear the object and return to pool
        for (const key in obj) {
            delete obj[key];
        }
        if (this.filterPool.length < 100) { // Max pool size
            this.filterPool.push(obj);
        }
    }

    static getUpdate(): any {
        return this.updatePool.pop() || {};
    }

    static returnUpdate(obj: any): void {
        for (const key in obj) {
            delete obj[key];
        }
        if (this.updatePool.length < 100) {
            this.updatePool.push(obj);
        }
    }

    static getOptions(): any {
        return this.optionsPool.pop() || {};
    }

    static returnOptions(obj: any): void {
        for (const key in obj) {
            delete obj[key];
        }
        if (this.optionsPool.length < 100) {
            this.optionsPool.push(obj);
        }
    }
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
     * OPTIMIZED: Execute a MongoDB updateOne operation - streamlined for putObjectVerCase1
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
        // FAST PATH: Execute immediately if batching disabled
        if (config.batchDelayMs <= 0) {
            collection.updateOne(filter, update, options)
                .then(result => callback(null, result as T))
                .catch(error => callback(error));
            return;
        }

        // OPTIMIZED BATCHING PATH
        const wrapper = MongoOperationsWrapper.getInstance(instanceId, config);
        wrapper.addUpdateToBatch<T>(collection, filter, update, options, callback, context);
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
     * OPTIMIZED: Static deleteOne method for MongoClientInterface compatibility
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
        // FAST PATH: Execute immediately if batching disabled
        if (config.batchDelayMs <= 0) {
            collection.deleteOne(filter, options)
                .then(result => callback(null, result as T))
                .catch(error => callback(error));
            return;
        }

        // For now, execute deleteOne immediately (less common than updateOne)
        collection.deleteOne(filter, options)
            .then(result => callback(null, result as T))
            .catch(error => callback(error));
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
     * OPTIMIZED: Add updateOne operation directly to batch - eliminates overhead
     */
    private addUpdateToBatch<T>(
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
        const collectionName = collection.collectionName;

        // Get or create batch queue with pre-allocated capacity
        if (!this.batchQueues.has(collectionName)) {
            const capacity = this.config.maxBatchSize;
            this.batchQueues.set(collectionName, {
                writeOps: [],
                bulkOps: new Array(capacity), // Pre-allocate to avoid resizing
                timer: null,
                collection,
                capacity
            });
        }

        const batchQueue = this.batchQueues.get(collectionName)!;

        // Create lightweight batched operation
        const batchedOp: BatchedOperation<T> = {
            type: 'updateOne',
            filter,
            update,
            options,
            callback,
            bucketName: context?.bucketName,
            objName: context?.objName,
            collection // Store collection reference for fallback
        };

        batchQueue.writeOps.push(batchedOp);

        // OPTIMIZED: Pre-build bulk operation to avoid conversion overhead later
        const bulkOp: AnyBulkWriteOperation = {
            updateOne: {
                filter,
                update,
                upsert: options?.upsert || false
            }
        };
        batchQueue.bulkOps[batchQueue.writeOps.length - 1] = bulkOp;

        // Flush immediately if batch is full
        if (batchQueue.writeOps.length >= this.config.maxBatchSize) {
            this.flushBatchOptimized(collectionName);
            return;
        }

        // Start timer if this is the first operation
        if (batchQueue.timer === null) {
            batchQueue.timer = setTimeout(() => {
                this.flushBatchOptimized(collectionName);
            }, this.config.batchDelayMs);
        }
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
            const capacity = this.config.maxBatchSize;
            this.batchQueues.set(collectionName, {
                writeOps: [],
                bulkOps: new Array(capacity),
                timer: null,
                collection,
                capacity
            });
        }

        const batchQueue = this.batchQueues.get(collectionName)!;
        const isWrite = MongoOperationsWrapper.isWriteOperation(operation);

        const batchedOp: BatchedOperation<T> = {
            type: operation,
            filter: params[0],
            update: params[1], 
            options: params[2],
            callback,
            collection,
            bucketName: context?.bucketName,
            objName: context?.objName
        };

        // Add to write queue (only writes are batched in our optimized version)
        batchQueue.writeOps.push(batchedOp);

        // Check if we should flush immediately due to batch size limit
        const totalOps = batchQueue.writeOps.length;
        if (totalOps >= this.config.maxBatchSize) {
            this.flushBatchOptimized(collectionName);
            return;
        }

        // Start timer if this is the first operation in the queue
        if (batchQueue.timer === null) {
            batchQueue.timer = setTimeout(() => {
                this.flushBatchOptimized(collectionName);
            }, this.config.batchDelayMs);
        }
    }

    /**
     * OPTIMIZED: Flush batch with pre-built bulk operations - eliminates conversion overhead
     */
    private flushBatchOptimized(collectionName: string): void {
        const batchQueue = this.batchQueues.get(collectionName);
        if (!batchQueue || batchQueue.writeOps.length === 0) {
            return;
        }

        const log = this.config.logger;
        const { writeOps, bulkOps, collection } = batchQueue;
        const opCount = writeOps.length;

        // Clear timer and reset queue
        if (batchQueue.timer) {
            clearTimeout(batchQueue.timer);
            batchQueue.timer = null;
        }
        this.batchQueues.delete(collectionName);

        // Use pre-built bulk operations (no conversion needed!)
        const bulkOpsToExecute = bulkOps.slice(0, opCount);

        // Execute bulk write with minimal overhead
        collection.bulkWrite(bulkOpsToExecute, { ordered: false })
            .then(() => {
                // All operations succeeded - call all callbacks
                for (let i = 0; i < opCount; i++) {
                    writeOps[i].callback(null, {} as any);
                }
            })
            .catch((error: any) => {
                log.warn('Optimized bulk write failed, falling back to individual execution', {
                    collection: collectionName,
                    error: error.message,
                    opsCount: opCount
                });
                
                // Fallback: execute individually
                this.fallbackToIndividualExecution(writeOps);
            });
    }

    /**
     * Flush a batch queue and execute all queued operations (LEGACY - use flushBatchOptimized)
     */
    private flushBatch(collectionName: string): void {
        // Delegate to optimized version
        this.flushBatchOptimized(collectionName);
    }





    /**
     * Fall back to individual execution for failed batch operations
     */
    private fallbackToIndividualExecution(operations: BatchedOperation[]): void {
        // OPTIMIZED: Direct execution without logging overhead for performance
        for (const op of operations) {
            if (op.type === 'updateOne') {
                // Direct path for updateOne (most common in putObjectVerCase1)
                const collection = op.collection;
                if (collection) {
                    collection.updateOne(op.filter, op.update, op.options)
                        .then(result => op.callback(null, result))
                        .catch(error => op.callback(error));
                } else {
                    op.callback(errors.InternalError.customizeDescription('Collection not found for fallback'));
                }
            } else {
                // Generic fallback for other operations (rarely used)
                op.callback(errors.InternalError.customizeDescription(`Fallback not implemented for ${op.type}`));
            }
        }
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
        collections: { [collectionName: string]: { writeOps: number } };
        writeOpsPerSec: number;
    } {
        const instance = MongoOperationsWrapper.instances.get(instanceId);
        if (!instance) {
            return { collections: {}, writeOpsPerSec: 0 };
        }

        const collections: { [collectionName: string]: { writeOps: number } } = {};
        
        instance.batchQueues.forEach((queue, collectionName) => {
            collections[collectionName] = {
                writeOps: queue.writeOps.length
            };
        });
        
        return {
            collections,
            writeOpsPerSec: instance.writeOpsTracker.currentOpsPerSec
        };
    }
}