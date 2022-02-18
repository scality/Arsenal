const assert = require('assert');

const azureMpuUtils =
    require('../../../../lib/s3middleware/azureHelpers/mpuUtils');
const padString = azureMpuUtils.padString;
const getSubPartInfo = azureMpuUtils.getSubPartInfo;

const padStringTests = [
    {
        category: 'partNumber',
        strings: [1, 10, 100, 10000],
        expectedResults: ['00001', '00010', '00100', '10000'],
    }, {
        category: 'subPart',
        strings: [1, 50],
        expectedResults: ['01', '50'],
    }, {
        category: 'part',
        strings: ['test|'],
        expectedResults:
        ['test|%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%'],
    },
];

const oneMb = 1024 * 1024;
const oneHundredMb = oneMb * 100;
const subPartInfoTests = [
    {
        desc: '100 mb',
        size: oneHundredMb,
        expectedNumberSubParts: 1,
        expectedLastPartSize: oneHundredMb,
    }, {
        desc: '101 mb',
        size: oneHundredMb + oneMb,
        expectedNumberSubParts: 2,
        expectedLastPartSize: oneMb,
    }, {
        desc: '599 mb',
        size: 6 * oneHundredMb - oneMb,
        expectedNumberSubParts: 6,
        expectedLastPartSize: oneHundredMb - oneMb,
    }, {
        desc: '600 mb',
        size: 6 * oneHundredMb,
        expectedNumberSubParts: 6,
        expectedLastPartSize: oneHundredMb,
    },
];

describe('s3middleware Azure MPU helper utility function', () => {
    padStringTests.forEach(test => {
        it(`padString should pad a ${test.category}`, done => {
            const result = test.strings.map(str =>
                padString(str, test.category));
            assert.deepStrictEqual(result, test.expectedResults);
            done();
        });
    });

    subPartInfoTests.forEach(test => {
        const { desc, size, expectedNumberSubParts, expectedLastPartSize }
            = test;
        it('getSubPartInfo should return correct result for ' +
        `dataContentLength of ${desc}`, done => {
            const result = getSubPartInfo(size);
            const expectedLastPartIndex = expectedNumberSubParts - 1;
            assert.strictEqual(result.lastPartIndex, expectedLastPartIndex);
            assert.strictEqual(result.lastPartSize, expectedLastPartSize);
            done();
        });
    });
});
