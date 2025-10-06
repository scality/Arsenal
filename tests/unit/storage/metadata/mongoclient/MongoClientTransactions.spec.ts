import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import MongoClientInterface from '../../../../../lib/storage/metadata/mongoclient/MongoClientInterface';
import { MongoClient, Collection, ClientSession } from 'mongodb';
import werelogs from 'werelogs';

describe('MongoClientInterface Transaction Methods', () => {
    let mongoClientInterface: MongoClientInterface;
    let mockClient: sinon.SinonStubbedInstance<MongoClient>;
    let mockSession: sinon.SinonStubbedInstance<ClientSession>;
    let mockCollection: sinon.SinonStubbedInstance<Collection>;
    let logger: werelogs.Logger;

    beforeEach(() => {
        logger = new werelogs.Logger('test');
        
        // Mock MongoDB client and session
        mockSession = {
            withTransaction: sinon.stub(),
            endSession: sinon.stub().resolves(),
        } as any;

        mockClient = {
            startSession: sinon.stub().returns(mockSession),
        } as any;

        mockCollection = {
            insertOne: sinon.stub().resolves(),
            updateOne: sinon.stub().resolves(),
            deleteOne: sinon.stub().resolves({ deletedCount: 1 }),
            findOne: sinon.stub().resolves(),
        } as any;

        // Create instance
        mongoClientInterface = new MongoClientInterface({
            replicaSetHosts: 'localhost:27017',
            writeConcern: 'majority',
            replicaSet: 'rs0',
            readPreference: 'primary',
            path: '/data',
            database: 'test',
            logger,
            instanceId: 'test-instance',
            replicationGroupId: 'test-group',
            authCredentials: {},
            isLocationTransient: () => false,
            shardCollections: false,
        } as any);

        // Inject mock client
        (mongoClientInterface as any).client = mockClient;
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('putObjectVerCase1WithTransaction', () => {
        it('should use transaction to put versioned object', async () => {
            const objVal = {
                key: 'test-key',
                versionId: undefined,
                isDeleteMarker: false,
            };
            const params = {
                vFormat: 'v1',
            };

            // Mock withTransaction to execute callback immediately
            mockSession.withTransaction.callsFake(async (callback) => {
                await callback();
            });

            const cb = sinon.stub();
            
            await mongoClientInterface.putObjectVerCase1WithTransaction(
                mockCollection as any,
                'test-bucket',
                'test-object',
                objVal as any,
                params as any,
                logger,
                cb
            );

            // Verify session was started and ended
            expect(mockClient.startSession.calledOnce).to.be.true;
            expect(mockSession.endSession.calledOnce).to.be.true;
            expect(cb.calledWith(null, sinon.match.string)).to.be.true;
        });

        it('should handle transaction errors gracefully', async () => {
            const objVal = {
                key: 'test-key',
                versionId: undefined,
                isDeleteMarker: false,
            };
            const params = {
                vFormat: 'v1',
            };

            // Mock withTransaction to throw error
            mockSession.withTransaction.rejects(new Error('Transaction failed'));

            const cb = sinon.stub();
            
            await mongoClientInterface.putObjectVerCase1WithTransaction(
                mockCollection as any,
                'test-bucket',
                'test-object',
                objVal as any,
                params as any,
                logger,
                cb
            );

            // Verify session was ended even on error
            expect(mockSession.endSession.calledOnce).to.be.true;
            expect(cb.calledWith(sinon.match.has('InternalError'))).to.be.true;
        });
    });

    describe('internalDeleteObjectWithTransaction', () => {
        it('should use transaction to delete object with oplog update', async () => {
            const mockDoc = {
                value: {
                    key: 'test-key',
                    deleted: false,
                },
            };

            mockCollection.findOne.resolves(mockDoc as any);
            
            // Mock withTransaction to execute callback immediately
            mockSession.withTransaction.callsFake(async (callback) => {
                await callback();
            });

            const cb = sinon.stub();
            
            await mongoClientInterface.internalDeleteObjectWithTransaction(
                mockCollection as any,
                'test-bucket',
                'test-key',
                {},
                null,
                logger,
                cb
            );

            // Verify operations were called
            expect(mockCollection.findOne.calledOnce).to.be.true;
            expect(mockCollection.updateOne.calledOnce).to.be.true;
            expect(mockCollection.deleteOne.calledOnce).to.be.true;
            expect(mockSession.endSession.calledOnce).to.be.true;
            expect(cb.calledWith(null, undefined)).to.be.true;
        });

        it('should handle object not found', async () => {
            mockCollection.findOne.resolves(null);
            
            // Mock withTransaction to execute callback immediately
            mockSession.withTransaction.callsFake(async (callback) => {
                await callback();
            });

            const cb = sinon.stub();
            
            await mongoClientInterface.internalDeleteObjectWithTransaction(
                mockCollection as any,
                'test-bucket',
                'test-key',
                {},
                null,
                logger,
                cb
            );

            // Verify NoSuchKey error
            expect(mockSession.endSession.calledOnce).to.be.true;
            expect(cb.calledWith(sinon.match.has('NoSuchKey'))).to.be.true;
        });
    });

    describe('internalPutObjectWithTransaction', () => {
        it('should use transaction to overwrite object with oplog update', async () => {
            const mockDoc = {
                value: {
                    key: 'test-key',
                    deleted: false,
                },
            };

            mockCollection.findOne.resolves(mockDoc as any);
            
            // Mock withTransaction to execute callback immediately
            mockSession.withTransaction.callsFake(async (callback) => {
                await callback();
            });

            const cb = sinon.stub();
            const newValue = { key: 'test-key', data: 'new-data' };
            
            await mongoClientInterface.internalPutObjectWithTransaction(
                mockCollection as any,
                'test-bucket',
                'test-object',
                newValue as any,
                { vFormat: 'v1', originOp: 's3:ObjectCreated:Put' } as any,
                logger,
                cb
            );

            // Verify operations were called twice (delete + put)
            expect(mockCollection.updateOne.calledTwice).to.be.true;
            expect(mockSession.endSession.calledOnce).to.be.true;
            expect(cb.calledWith(null)).to.be.true;
        });
    });

    describe('putObjectNoVerWithTransaction', () => {
        it('should use transaction to put object without versioning', async () => {
            // Mock withTransaction to execute callback immediately
            mockSession.withTransaction.callsFake(async (callback) => {
                await callback();
            });

            const cb = sinon.stub();
            const value = { key: 'test-key', data: 'test-data' };
            
            await mongoClientInterface.putObjectNoVerWithTransaction(
                mockCollection as any,
                'test-bucket',
                'test-object',
                value as any,
                { vFormat: 'v1' } as any,
                logger,
                cb
            );

            // Verify upsert was called
            expect(mockCollection.updateOne.calledOnce).to.be.true;
            expect(mockSession.endSession.calledOnce).to.be.true;
            expect(cb.calledWith(null)).to.be.true;
        });
    });

    describe('putObjectNoVerWithOplogUpdateWithTransaction', () => {
        it('should use transaction for put with oplog when object exists', async () => {
            const mockDoc = {
                value: {
                    key: 'test-key',
                    deleted: false,
                },
            };

            mockCollection.findOne.resolves(mockDoc as any);
            
            // Mock withTransaction to execute callback immediately
            mockSession.withTransaction.callsFake(async (callback) => {
                await callback();
            });

            const cb = sinon.stub();
            const value = { key: 'test-key', data: 'new-data' };
            
            await mongoClientInterface.putObjectNoVerWithOplogUpdateWithTransaction(
                mockCollection as any,
                'test-bucket',
                'test-object',
                value as any,
                { vFormat: 'v1', originOp: 's3:ObjectCreated:Put', needOplogUpdate: true } as any,
                logger,
                cb
            );

            // Verify operations (delete + put)
            expect(mockCollection.findOne.calledOnce).to.be.true;
            expect(mockCollection.updateOne.calledTwice).to.be.true;
            expect(mockSession.endSession.calledOnce).to.be.true;
            expect(cb.calledWith(null)).to.be.true;
        });

        it('should use transaction for put with oplog when object does not exist', async () => {
            mockCollection.findOne.resolves(null);
            
            // Mock withTransaction to execute callback immediately
            mockSession.withTransaction.callsFake(async (callback) => {
                await callback();
            });

            const cb = sinon.stub();
            const value = { key: 'test-key', data: 'new-data' };
            
            await mongoClientInterface.putObjectNoVerWithOplogUpdateWithTransaction(
                mockCollection as any,
                'test-bucket',
                'test-object',
                value as any,
                { vFormat: 'v1', originOp: 's3:ObjectCreated:Put', needOplogUpdate: true } as any,
                logger,
                cb
            );

            // Verify only put operation (no delete since object doesn't exist)
            expect(mockCollection.findOne.calledOnce).to.be.true;
            expect(mockCollection.updateOne.calledOnce).to.be.true;
            expect(mockSession.endSession.calledOnce).to.be.true;
            expect(cb.calledWith(null)).to.be.true;
        });
    });
});

