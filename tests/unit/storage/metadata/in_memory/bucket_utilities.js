'use strict'; //eslint-disable-line

const assert = require('assert');

const { markerFilterMPU } =
    require('../../../../../lib/storage/metadata/in_memory/bucket_utilities');

function dupeArray(arr) {
    const dupe = [];

    arr.forEach(i => {
        dupe.push(Object.assign({}, i));
    });

    return dupe;
}

describe('bucket utility methods for in_memory backend', () => {
    it('should return an array of multipart uploads starting with the item ' +
    'right after the specified keyMarker and uploadIdMarker', () => {
        const mpus = [
            {
                key: 'key-1',
                uploadId: '2624ca6080c841d48a2481941df868a9',
            },
            {
                key: 'key-1',
                uploadId: '4ffeca96b0c24ea9b538b8f0b60cede3',
            },
            {
                key: 'key-1',
                uploadId: '52e5b94474894990a2b94330bb3c8fa9',
            },
            {
                key: 'key-1',
                uploadId: '54e530c5d4c741898c8e161d426591cb',
            },
            {
                key: 'key-1',
                uploadId: '6cc59f9d29254e81ab6cb6332fb46314',
            },
            {
                key: 'key-1',
                uploadId: 'fe9dd10776c9476697632d0b55960a05',
            },
            {
                key: 'key-2',
                uploadId: '68e24ccb96c14beea79bf01fc130fdf5',
            },
        ];

        [
            {
                keyMarker: 'key-1',
                uploadIdMarker: '54e530c5d4c741898c8e161d426591cb',
                expected: 3,
            },
            {
                keyMarker: 'key-2',
                uploadIdMarker: '68e24ccb96c14beea79bf01fc130fdf5',
                expected: 0,
            },
            {
                keyMarker: 'key-1',
                uploadIdMarker: '2624ca6080c841d48a2481941df868a9',
                expected: 6,
            },
        ].forEach(item => {
            const res = markerFilterMPU(item, dupeArray(mpus));
            assert.equal(res.length, item.expected);

            const expected = mpus.slice(mpus.length - res.length);
            assert.deepStrictEqual(res, expected);
        });
    });
});
