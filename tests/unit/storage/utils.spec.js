const assert = require('assert');
const sinon = require('sinon');
const fs = require('fs');
const { serializeCircJSON, getDiskUsage } = require('../../../lib/storage/utils');
const { errorInstances } = require('../../../lib/errors');

const obj = {
    key1: 'foo',
    key2: 1,
    key3: { key4: 5 },
};

describe('SerializeCircJSON', () => {
    it('should stringify circular JSON', () => {
        try {
            const circularJSON = Object.assign(obj, {});
            circularJSON.key5 = circularJSON;
            const json = JSON.stringify(circularJSON, serializeCircJSON());
            const parsedJSON = JSON.parse(json);
            assert.strictEqual(parsedJSON.key1, 'foo');
            assert.strictEqual(parsedJSON.key2, 1);
            assert.deepStrictEqual(parsedJSON.key3, { key4: 5 });
            assert.strictEqual(parsedJSON.key5, '[Circular ~. ]');
        } catch (e) {
            assert.ifError(e);
        }
    });

    it('should stringify valid JSON', () => {
        try {
            const validJSON = Object.assign(obj, {});
            const json = JSON.stringify(validJSON, serializeCircJSON());
            const parsedJSON = JSON.parse(json);
            assert.strictEqual(parsedJSON.key1, 'foo');
            assert.strictEqual(parsedJSON.key2, 1);
            assert.deepStrictEqual(parsedJSON.key3, { key4: 5 });
        } catch (e) {
            assert.ifError(e);
        }
    });
});

describe('getDiskUsage', () => {
    let sandbox;
    const testPath = '/test/path';
    
    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });
    
    afterEach(() => {
        sandbox.restore();
    });
    
    it('should return error if fs.statfs is not available', done => {
        // Save original statfs and temporarily remove it
        const originalStatfs = fs.statfs;
        delete fs.statfs;
        
        getDiskUsage(testPath, (err, result) => {
            assert.deepStrictEqual(
                err,
                errorInstances.InternalError
                    .customizeDescription('fs.statfs is not available on this system')
            );
            assert.strictEqual(result, undefined);
            
            // Restore original statfs
            fs.statfs = originalStatfs;
            done();
        });
    });
    
    it('should return error if fs.statfs fails', done => {
        const statfsError = new Error('statfs error');
        sandbox.stub(fs, 'statfs').callsFake((path, callback) => {
            callback(statfsError);
        });
        
        getDiskUsage(testPath, (err, result) => {
            assert.strictEqual(err, statfsError);
            assert.strictEqual(result, undefined);
            done();
        });
    });
    
    it('should return disk usage information if fs.statfs succeeds', done => {
        const mockStats = {
            bavail: 100,   // Available blocks
            bfree: 200,    // Free blocks
            blocks: 1000,  // Total blocks
            bsize: 4096,   // Block size
        };
        
        sandbox.stub(fs, 'statfs').callsFake((path, callback) => {
            assert.strictEqual(path, testPath);
            callback(null, mockStats);
        });
        
        getDiskUsage(testPath, (err, result) => {
            assert.strictEqual(err, null);
            assert.deepStrictEqual(result, {
                available: mockStats.bavail * mockStats.bsize,
                free: mockStats.bfree * mockStats.bsize,
                total: mockStats.blocks * mockStats.bsize
            });
            done();
        });
    });
    
    it('should handle different block sizes correctly', done => {
        const mockStats = {
            bavail: 100,
            bfree: 200,
            blocks: 1000,
            bsize: 1024, // Different block size
        };
        
        sandbox.stub(fs, 'statfs').callsFake((path, callback) => {
            callback(null, mockStats);
        });
        
        getDiskUsage(testPath, (err, result) => {
            assert.strictEqual(err, null);
            assert.deepStrictEqual(result, {
                available: 102400, // 100 * 1024
                free: 204800,      // 200 * 1024
                total: 1024000,    // 1000 * 1024
            });
            done();
        });
    });
});
