const assert = require('assert');
const NullStream = require('../../../lib/s3middleware/nullStream');
const MD5Sum = require('../../../lib/s3middleware/MD5Sum');

const nullChunks = [
    { size: 1, md5sum: '93b885adfe0da089cdf634904fd59f71' },
    { size: 15000000, md5sum: 'e05ffc4ac83a1a4f4d545a3a4852383f' },
];

function testNullChunk(size, range, expectedMD5, done) {
    const nullChunk = new NullStream(size, range);
    const digestStream = new MD5Sum();
    digestStream.on('hashed', () => {
        assert.strictEqual(digestStream.completedHash, expectedMD5);
        done();
    });
    nullChunk.pipe(digestStream);
    digestStream.on('data', () => {});
}

describe('s3middleware.NullStream', () => {
    for (let i = 0; i < nullChunks.length; ++i) {
        const size = nullChunks[i].size;
        const md5sum = nullChunks[i].md5sum;
        test(`should generate ${size} null bytes by size`, done => {
            testNullChunk(size, null, md5sum, done);
        });
        test(`should generate ${size} null bytes by range`, done => {
            const dummyOffset = 9320954;
            testNullChunk(0, [dummyOffset, dummyOffset + size - 1],
                          md5sum, done);
        });
    }
});
