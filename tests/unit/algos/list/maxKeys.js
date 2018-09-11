const assert = require('assert');

const list = '../../../../lib/algos/list';
const { MultipartUploads } = require(`${list}/MPU`);
const { List } = require(`${list}/basic`);
const { Delimiter } = require(`${list}/delimiter`);
const { DelimiterMaster } = require(`${list}/delimiterMaster`);
const { DelimiterVersions } = require(`${list}/delimiterVersions`);
const { FILTER_ACCEPT, FILTER_END } = require(`${list}/tools`);


const extensions = [
    { name: 'MPU', Ext: MultipartUploads },
    { name: 'List', Ext: List },
    { name: 'Delimiter', Ext: Delimiter },
    { name: 'DelimiterMaster', Ext: DelimiterMaster },
    { name: 'DelimiterVersion', Ext: DelimiterVersions },
];


describe('Delimiter listing algorithm', () => {
    const doWhat = 'returns FILTER_END on the next entry once max keys reached';
    extensions.forEach(extension => {
        it(`Should extension ${extension.name} ${doWhat}`, () => {
            /* Use a value complient with MultipartUploads extension
             * requirements for values. It has no impact on other extensions.
             **/
            const initiator1 = { ID: '1', DisplayName: 'initiator1' };
            const value = JSON.stringify({
                'key': 'key1',
                'uploadId': 'uploadId1',
                'initiator': initiator1,
                'owner-id': '1',
                'owner-display-name': 'owner1',
                'x-amz-storage-class': 'STANDART',
                'initiated': '',
            });
            const obj1 = { key: 'key1', value };
            const obj2 = { key: 'key2', value };

            const ext = new extension.Ext({ maxKeys: 1 });

            assert.strictEqual(ext.filter(obj1), FILTER_ACCEPT);
            assert.strictEqual(ext.filter(obj2), FILTER_END);
        });
    });
});
