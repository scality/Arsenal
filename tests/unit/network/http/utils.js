'use strict'; // eslint-disable-line

const assert = require('assert');

const errors = require('../../../../lib/errors');

const { parseRange,
        parseRangeSpec,
        getByteRangeFromSpec } = require('../../../../lib/network/http/utils');

function checkParseRange(rangeHeader, totalLength, expectedRange) {
    const { range, error } = parseRange(rangeHeader, totalLength);
    assert.ifError(error);
    assert.deepStrictEqual(range, expectedRange);
}

describe('parseRangeSpec function', () => {
    [{ rangeHeader: 'bytes=1000-2000',
       expectedRangeSpec: { start: 1000, end: 2000 } },
     { rangeHeader: 'bytes=1000-',
       expectedRangeSpec: { start: 1000 } },
     { rangeHeader: 'bytes=-',
       expectedRangeSpec: { error: errors.InvalidArgument } },
     { rangeHeader: 'bytes=10-9',
       expectedRangeSpec: { error: errors.InvalidArgument } },
    ].forEach(testCase => {
        const { rangeHeader, expectedRangeSpec } = testCase;

        it(`should return ${expectedRangeSpec} on range "${rangeHeader}"`,
        () => {
            const rangeSpec = parseRangeSpec(rangeHeader);
            if (expectedRangeSpec.error) {
                assert(rangeSpec.error);
                assert.strictEqual(rangeSpec.error.message,
                                   expectedRangeSpec.error.message);
            } else {
                assert.ifError(rangeSpec.error);
            }
            assert.strictEqual(rangeSpec.start, expectedRangeSpec.start);
            assert.strictEqual(rangeSpec.end, expectedRangeSpec.end);
            assert.strictEqual(rangeSpec.suffix, expectedRangeSpec.suffix);
        });
    });
});

describe('getByteRangeFromSpec function', () => {
    [{ rangeSpec: { start: 1000, end: 2000 }, objectSize: 3000,
       expectedByteRange: { range: [1000, 2000] } },
     { rangeSpec: { start: 1000, end: 5000 }, objectSize: 3000,
       expectedByteRange: { range: [1000, 2999] } },
     { rangeSpec: { start: 1000 }, objectSize: 3000,
       expectedByteRange: { range: [1000, 2999] } },
     { rangeSpec: { suffix: 1000 }, objectSize: 3000,
       expectedByteRange: { range: [2000, 2999] } },
     { rangeSpec: { suffix: 4000 }, objectSize: 3000,
       expectedByteRange: { range: [0, 2999] } },
     { rangeSpec: { start: 2999 }, objectSize: 3000,
       expectedByteRange: { range: [2999, 2999] } },
     { rangeSpec: { start: 3000 }, objectSize: 3000,
       expectedByteRange: { error: errors.InvalidRange } },
     { rangeSpec: { start: 0, end: 10 }, objectSize: 0,
       expectedByteRange: { error: errors.InvalidRange } },
     { rangeSpec: { suffix: 10 }, objectSize: 0,
       expectedByteRange: { } },
     { rangeSpec: { suffix: 0 }, objectSize: 0,
       expectedByteRange: { error: errors.InvalidRange } },
    ].forEach(testCase => {
        const { rangeSpec, objectSize, expectedByteRange } = testCase;

        it(`should transform spec ${rangeSpec} with object size ` +
           `${objectSize} to byte range ${expectedByteRange}`, () => {
            const byteRange = getByteRangeFromSpec(rangeSpec, objectSize);
            if (expectedByteRange.error) {
                assert(byteRange.error);
                assert.strictEqual(byteRange.error.message,
                                   expectedByteRange.error.message);
            } else {
                assert.ifError(byteRange.error);
            }
            assert.deepStrictEqual(byteRange.range,
                                   expectedByteRange.range);
        });
    });
});

describe('parseRange function', () => {
    it('should return an object with the start and end if range is '
       + 'valid', () => {
        checkParseRange('bytes=0-9', 10, [0, 9]);
    });

    it('should set the end of the range at the total object length minus 1 ' +
        'if the provided end of range goes beyond the end of the object ' +
        'length', () => {
        checkParseRange('bytes=0-9', 8, [0, 7]);
    });

    it('should handle incomplete range specifier where only end offset is ' +
    'provided', () => {
        checkParseRange('bytes=-500', 10000, [9500, 9999]);
    });

    it('should handle incomplete range specifier where only start ' +
    'provided', () => {
        checkParseRange('bytes=9500-', 10000, [9500, 9999]);
    });

    it('should return undefined for the range if the range header ' +
        'format is invalid: missing equal', () => {
        checkParseRange('bytes0-9', 10);
    });

    it('should return undefined for the range if the range header ' +
        'format is invalid: missing dash', () => {
        checkParseRange('bytes=09', 10);
    });

    it('should return undefined for the range if the range header ' +
        'format is invalid: value invalid character', () => {
        checkParseRange('bytes=%-4', 10);
    });

    it('should return undefined for the range if the range header ' +
    'format is invalid: value not int', () => {
        checkParseRange('bytes=4-a', 10);
    });

    it('should return undefined for the range if the range header ' +
        'format is invalid: start > end', () => {
        checkParseRange('bytes=5-4', 10);
    });

    it('should return undefined for the range if the range header ' +
        'format is invalid: negative start bound', () => {
        checkParseRange('bytes=-2-5', 10);
    });

    it('should return InvalidRange if the range of the resource ' +
    'does not cover the byte range', () => {
        const rangeHeader = 'bytes=10-30';
        const totalLength = 10;
        const { range, error } = parseRange(rangeHeader, totalLength);
        assert.strictEqual(error.code, 416);
        assert.strictEqual(range, undefined);
    });
    it('should return undefined for "bytes=-" request (invalid syntax) ',
    () => {
        checkParseRange('bytes=-', 10);
    });
    it('should return undefined for "bytes=-" request (invalid syntax, ' +
    'empty object)', () => {
        checkParseRange('bytes=-', 0);
    });
    it('should return undefined for "bytes=10-9" request (invalid syntax, ' +
    'empty object)', () => {
        checkParseRange('bytes=10-9', 0);
    });
    it('should return InvalidRange on 0-byte suffix range request', () => {
        const rangeHeader = 'bytes=-0';
        const { range, error } = parseRange(rangeHeader, 10);
        assert.strictEqual(error.code, 416);
        assert.strictEqual(range, undefined);
    });
    it('should return InvalidRange on 0-byte suffix range request ' +
    '(empty object)', () => {
        const rangeHeader = 'bytes=-0';
        const { range, error } = parseRange(rangeHeader, 0);
        assert.strictEqual(error.code, 416);
        assert.strictEqual(range, undefined);
    });
    it('should return undefined on suffix range request on empty ' +
    'object', () => {
        checkParseRange('bytes=-10', 0);
    });
    it('should return InvalidRange on empty object when only start==0 ' +
    'provided', () => {
        const rangeHeader = 'bytes=0-';
        const { range, error } = parseRange(rangeHeader, 0);
        assert.strictEqual(error.code, 416);
        assert.strictEqual(range, undefined);
    });
    it('should return InvalidRange on empty object when only start!=0 ' +
    'provided', () => {
        const rangeHeader = 'bytes=10-';
        const { range, error } = parseRange(rangeHeader, 0);
        assert.strictEqual(error.code, 416);
        assert.strictEqual(range, undefined);
    });
    it('should return InvalidRange on empty object when start and end ' +
    'are provided', () => {
        const rangeHeader = 'bytes=10-30';
        const { range, error } = parseRange(rangeHeader, 0);
        assert.strictEqual(error.code, 416);
        assert.strictEqual(range, undefined);
    });
});
