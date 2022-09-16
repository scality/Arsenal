const assert = require('assert');
const crypto = require('crypto');

const { createAggregateETag } =
      require('../../../lib/s3middleware/processMpuParts');

describe('createAggregateETag', () => {
    [{
        partETags: ['3858f62230ac3c915f300c664312c63f'],
        aggregateETag: 'c4529dc85643bb0c5a96e46587377777-1',
    }, {
        partETags: ['ffc88b4ca90a355f8ddba6b2c3b2af5c',
            'd067a0fa9dc61a6e7195ca99696b5a89'],
        aggregateETag: '620e8b191a353bdc9189840bb3904928-2',
    }, {
        partETags: ['ffc88b4ca90a355f8ddba6b2c3b2af5c',
            'd067a0fa9dc61a6e7195ca99696b5a89',
            '49dcd91231f801159e893fb5c6674985',
            '1292a1f4afecfeb84e1b200389d1c904',
            '6b70b0751c98492074a7359f0f70d76d',
            '5c55c71b3b582f6b700f83bb834f2430',
            '84562b55618378a7ac5cfcbc7f3b2ceb',
            'b5693c44bad7a2cf51c82c6a2fe1a4b6',
            '628b37ac2dee9c123cd2e3e2e486eb27',
            '4cacc7e3b7933e54422243964db169af',
            '0add1fb9122cc9df84aee7c4bb86d658',
            '5887704d69ee209f32c9314c345c8084',
            '374e87eeee83bed471b78eefc8d7e28e',
            '4e2af9f5fa8b64b19f78ddfbcfcab148',
            '8e06231275f3afe7953fc7d57b65723f',
            'c972158cb957cf48e18b475b908d5d82',
            '311c2324dd756c9655129de049f69c9b',
            '0188a9df3e1c4ce18f81e4ba24c672a0',
            '1a15c4da6038a6626ad16473712eb358',
            'd13c52938d8e0f01192d16b0de17ea4c'],
        aggregateETag: 'd3d5a0ab698dd360e755a467f7899e7e-20',
    }].forEach(test => {
        it(`should compute aggregate ETag with ${test.partETags.length} parts`,
            () => {
                const aggregateETag = createAggregateETag(test.partETags);
                assert.strictEqual(aggregateETag, test.aggregateETag);
            });
    });

    it('should compute aggregate ETag with 10000 parts', () => {
        const partETags = [];
        for (let i = 0; i < 10000; ++i) {
            const md5hash = crypto.createHash('md5');
            md5hash.update(`part${i}`, 'binary');
            partETags.push(md5hash.digest('hex'));
        }
        const aggregateETag = createAggregateETag(partETags);
        assert.strictEqual(
            aggregateETag, 'bff290751e485f06dcc0203c77ed2fd9-10000');
    });
});
