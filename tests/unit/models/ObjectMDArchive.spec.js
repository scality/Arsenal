const assert = require('assert');
const ObjectMDArchive = require('../../../lib/models/ObjectMDArchive');

const testArchive = {
    archiveInfo: {
        any: 'value',
    },
    restoreRequestedAt: new Date(0),
    restoreRequestedDays: 5,
    restoreCompletedAt: new Date(1000),
    restoreWillExpireAt: new Date(10000),
};

const archive = new ObjectMDArchive(
    testArchive.archiveInfo,
    testArchive.restoreRequestedAt,
    testArchive.restoreRequestedDays,
    testArchive.restoreCompletedAt,
    testArchive.restoreWillExpireAt,
);

describe('ObjectMDArchive value', () => {
    it('should return the correct value', () => {
        const amzRestoreObj = archive.getValue();
        assert.deepStrictEqual(amzRestoreObj, archive);
    });
});

describe('ObjectMDArchive setters/getters', () => {
    let archived = null;
    beforeEach(() => {
        archived = new ObjectMDArchive(
            testArchive.archiveInfo,
        );
    });
    it('should control the archiveInfo attribute', () => {
        const badArchiveInfo = 'bad';
        const info = {
            test: 'data',
        };
        archive.setArchiveInfo(info);
        assert.deepStrictEqual(archive.getArchiveInfo(),
            info);
        assert.throws(() => {
            archive.setArchiveInfo(badArchiveInfo);
        });
    });
    it('should control the restoreRequestedAt attribute', () => {
        const requestedAt = new Date(123456);
        const wrongRestoreRequestedAt = 'bad';
        assert.doesNotThrow(() => {
            archived.setRestoreRequestedAt(requestedAt);
        });
        archive.setRestoreRequestedAt(requestedAt);
        assert.deepStrictEqual(archive.getRestoreRequestedAt(),
            requestedAt);
        assert.throws(() => {
            archive.setRestoreRequestedAt(wrongRestoreRequestedAt);
        });
    });
    it('should control the restoreRequestedDays attribute', () => {
        const requestedDays = 8;
        const wrongRestoreRequestedDays = 'bad';
        assert.doesNotThrow(() => {
            archived.setRestoreRequestedDays(requestedDays);
        });
        archive.setRestoreRequestedDays(requestedDays);
        assert.deepStrictEqual(archive.getRestoreRequestedDays(),
            requestedDays);
        assert.throws(() => {
            archive.setRestoreRequestedDays(wrongRestoreRequestedDays);
        });
    });
    it('should control the restoreCompletedAt attribute', () => {
        const completedAt = new Date(123456);
        const wrongRestoreCompletedAt = 'bad';
        assert.throws(() => {
            archived.setRestoreCompletedAt(completedAt);
        });
        archive.setRestoreCompletedAt(completedAt);
        assert.deepStrictEqual(archive.getRestoreCompletedAt(),
            completedAt);
        assert.throws(() => {
            archive.setRestoreCompletedAt(wrongRestoreCompletedAt);
        });
    });
    it('should control the restoreWillExpireAt attribute', () => {
        const willExpireAt = new Date(123456);
        const wrongRestoreWillExpireAt = 'bad';
        assert.throws(() => {
            archived.setRestoreWillExpireAt(willExpireAt);
        });
        archive.setRestoreWillExpireAt(willExpireAt);
        assert.deepStrictEqual(archive.getRestoreWillExpireAt(),
            willExpireAt);
        assert.throws(() => {
            archive.setRestoreWillExpireAt(wrongRestoreWillExpireAt);
        });
    });
    it('should return false if the provided object is not valid', () => {
        assert.strictEqual(ObjectMDArchive.isValid({
            wrong: 'data',
        }), false);
    });
});
