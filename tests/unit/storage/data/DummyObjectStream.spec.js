const assert = require('assert');
const DummyObjectStream = require('./DummyObjectStream');

async function testStream(startByteOffset, streamSize, expectedData) {
    const p = new Promise((resolve, reject) => {
        const dos = new DummyObjectStream(startByteOffset, streamSize);
        const readChunks = [];
        dos
            .on('data', chunk => readChunks.push(chunk))
            .on('error', err => reject(err))
            .on('end', () => {
                assert.strictEqual(readChunks.join(''), expectedData);
                resolve();
            });
    });
    return p;
}

describe('DummyObjectStream', () => {
    jest.setTimeout(30000);
    it('should return a stream of 8-byte hex-encoded blocks', async () => {
        /* eslint-disable no-unused-expressions */
        await testStream(0, 0, '');
        await testStream(50, 0, '');
        await testStream(0, 1, ' ');
        await testStream(1, 1, '0');
        await testStream(1, 7, '0000000');
        await testStream(0, 8, ' 0000000');
        await testStream(1, 8, '0000000 ');
        await testStream(0, 10, ' 0000000 0');
        await testStream(1, 10, '0000000 00');
        await testStream(7, 5, '0 000');
        await testStream(7, 12, '0 0000008 00');
        await testStream(8, 12, ' 0000008 000');
        await testStream(9, 12, '0000008 0000');
        await testStream(40, 16, ' 0000028 0000030');
        // check that offsets wrap around after 256MB
        await testStream(256 * 1024 * 1024 - 8, 16, ' ffffff8 0000000');
        await testStream(567890123, 30, '950c8 1d950d0 1d950d8 1d950e0 ');

        // test larger streams with 8MiB of contents
        const expectedLarge =
              new Array(1024 * 1024).fill()
                  .map((x, i) => ` ${`000000${Number(i * 8).toString(16)}`.slice(-7)}`)
                  .join('');
        await testStream(0, 8 * 1024 * 1024, expectedLarge);

        const expectedLarge2 =
              ['950c8']
                  .concat(new Array(1024 * 1024).fill()
                      .map((x, i) => ` ${Number(0x1d950d0 + i * 8).toString(16)}`))
                  .concat([' 25'])
                  .join('');
        await testStream(567890123, 5 + 8 * 1024 * 1024 + 3, expectedLarge2);
        /* eslint-enable no-unused-expressions */
    });
});
