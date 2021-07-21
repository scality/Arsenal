const assert = require('assert');
const ObjectMDLocation = require('../../../lib/models/ObjectMDLocation');

describe('ObjectMDLocation', () => {
    it('class getters/setters', () => {
        const locValue = {
            key: 'fookey',
            start: 42,
            size: 100,
            dataStoreName: 'awsbackend',
            dataStoreETag: '2:abcdefghi',
            dataStoreVersionId: 'someversion',
            blockId: 'someBlockId',
            cryptoScheme: 1,
            cipheredDataKey: 'CiPhErEdDaTaKeY',
        };
        const location = new ObjectMDLocation(locValue);
        assert.strictEqual(location.getKey(), 'fookey');
        assert.strictEqual(location.getDataStoreName(), 'awsbackend');
        assert.strictEqual(location.getDataStoreETag(), '2:abcdefghi');
        assert.strictEqual(location.getDataStoreVersionId(), 'someversion');
        assert.strictEqual(location.getPartNumber(), 2);
        assert.strictEqual(location.getPartETag(), 'abcdefghi');
        assert.strictEqual(location.getPartStart(), 42);
        assert.strictEqual(location.getPartSize(), 100);
        assert.strictEqual(location.getBlockId(), 'someBlockId');
        assert.strictEqual(location.getCryptoScheme(), 1);
        assert.strictEqual(location.getCipheredDataKey(), 'CiPhErEdDaTaKeY');

        assert.deepStrictEqual(location.getValue(), locValue);

        location.setPartSize(200);
        assert.strictEqual(location.getPartSize(), 200);
    });

    it('ObjectMDLocation::setDataLocation()', () => {
        const location = new ObjectMDLocation({
            key: 'fookey',
            start: 42,
            size: 100,
            dataStoreName: 'awsbackend',
            dataStoreETag: '2:abcdefghi',
            dataStoreVersionId: 'someversion',
            blockId: 'someBlockId',
            cryptoScheme: 1,
            cipheredDataKey: 'CiPhErEdDaTaKeY',
        });
        location.setDataLocation({ key: 'secondkey',
                                   dataStoreName: 'gcpbackend' });
        assert.strictEqual(location.getKey(), 'secondkey');
        assert.strictEqual(location.getDataStoreName(), 'gcpbackend');
        assert.strictEqual(location.getDataStoreVersionId(), undefined);
        assert.strictEqual(location.getCryptoScheme(), undefined);
        assert.strictEqual(location.getCipheredDataKey(), undefined);
        assert.deepStrictEqual(location.getValue(), {
            dataStoreETag: '2:abcdefghi',
            dataStoreName: 'gcpbackend',
            key: 'secondkey',
            size: 100,
            start: 42,
            blockId: 'someBlockId',
        });
        location.setDataLocation({ key: 'thirdkey',
                                   dataStoreName: 'azurebackend',
                                   dataStoreVersionId: 'newversion',
                                   cryptoScheme: 1,
                                   cipheredDataKey: 'NeWcIpHeReDdAtAkEy' });
        assert.strictEqual(location.getKey(), 'thirdkey');
        assert.strictEqual(location.getDataStoreName(), 'azurebackend');
        assert.strictEqual(location.getDataStoreVersionId(), 'newversion');
        assert.strictEqual(location.getCryptoScheme(), 1);
        assert.strictEqual(location.getCipheredDataKey(), 'NeWcIpHeReDdAtAkEy');
        location.setBlockId('otherBlockId');
        assert.strictEqual(location.getBlockId(), 'otherBlockId');
    });
});
