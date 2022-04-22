const crypto = require('crypto');

const {
    _checkEtagMatch,
    _checkEtagNoneMatch,
    _checkModifiedSince,
    _checkUnmodifiedSince,
    validateConditionalHeaders,
} = require('../../../lib/s3middleware/validateConditionalHeaders');

const lastModified = new Date();
const beforeLastModified = new Date();
const afterLastModified = new Date();
beforeLastModified.setDate(lastModified.getDate() - 1);
afterLastModified.setDate(lastModified.getDate() + 1);
const contentMD5 = crypto.createHash('md5').update('a').digest('hex');
const otherMD5 = crypto.createHash('md5').update('b').digest('hex');

const eTagMatchValues = [
    { desc: 'matching ETag', value: contentMD5 },
    { desc: 'quoted matching ETag', value: `"${contentMD5}"` },
    { desc: '"*"', value: '*' },
];
const expectedSuccess = {
    present: true,
    error: null,
};

const basicTestCases = {
    'if-modified-since': {
        success: beforeLastModified,
        fail: afterLastModified,
        error: 'NotModified',
    },
    'if-unmodified-since': {
        success: afterLastModified,
        fail: beforeLastModified,
        error: 'PreconditionFailed',
    },
    'if-match': {
        success: contentMD5,
        fail: otherMD5,
        error: 'PreconditionFailed',
    },
    'if-none-match': {
        success: otherMD5,
        fail: contentMD5,
        error: 'NotModified',
    },
};

const combinedCases = [
    {
        headers: {
            'if-unmodified-since': 'success',
            'if-match': 'success',
        },
        result: 'success',
    }, {
        headers: {
            'if-unmodified-since': 'success',
            'if-match': 'fail',
        },
        result: basicTestCases['if-match'].error,
    }, {
        headers: {
            'if-unmodified-since': 'fail',
            'if-match': 'success',
        },
        result: 'success',
    }, {
        headers: {
            'if-unmodified-since': 'fail',
            'if-match': 'fail',
        },
        result: basicTestCases['if-match'].error,
    },
];

function _addCases(dominantHeader, recessiveHeader) {
    const headers = {};
    headers[dominantHeader] = 'success';
    headers[recessiveHeader] = 'success';
    // dominant success + recessive success => success
    combinedCases.push({
        headers: Object.assign({}, headers),
        result: 'success',
    });
    headers[recessiveHeader] = 'fail';
    // dominant success + recessive fail => recessive fail
    combinedCases.push({
        headers: Object.assign({}, headers),
        result: basicTestCases[recessiveHeader].error,
    });
    // dominant fail + recessive fail => dominant fail
    headers[dominantHeader] = 'fail';
    combinedCases.push({
        headers: Object.assign({}, headers),
        result: basicTestCases[dominantHeader].error,
    });
    // dominant fail + recessive success => dominant fail
    headers[recessiveHeader] = 'success';
    combinedCases.push({
        headers: Object.assign({}, headers),
        result: basicTestCases[dominantHeader].error,
    });
}

['if-unmodified-since', 'if-match'].forEach(dominantHeader => {
    ['if-none-match', 'if-modified-since'].forEach(recessiveHeader => {
        _addCases(dominantHeader, recessiveHeader);
    });
});

_addCases('if-none-match', 'if-modified-since');

function checkSuccess(h) {
    it('should succeed when value meets condition', () => {
        const headers = {};
        headers[h] = basicTestCases[h].success;
        const result =
            validateConditionalHeaders(headers, lastModified, contentMD5);
        expect(result.error).toBeUndefined();
    });
}

function checkFailure(h) {
    it('should fail when value does not meet condition', () => {
        const headers = {};
        headers[h] = basicTestCases[h].fail;
        const result =
            validateConditionalHeaders(headers, lastModified, contentMD5);
        expect(result.present).toBeTruthy();
        expect(result.error.is[basicTestCases[h].error]).toBeTruthy();
    });
}

function checkCaseResult(testCase) {
    const h = Object.keys(testCase.headers);
    it(`"${h[0]}" ${testCase.headers[h[0]]} and "${h[1]}" ` +
    `${testCase.headers[h[1]]}: should return ${testCase.result}`, () => {
        const testHeaders = {};
        h.forEach(key => {
            testHeaders[key] = basicTestCases[key][testCase.headers[key]];
        });
        const result = validateConditionalHeaders(testHeaders,
            lastModified, contentMD5);
        if (testCase.result === 'success') {
            expect(result.error).toBeUndefined();
        } else {
            expect(result.present).toBeTruthy();
            expect(result.error.is[testCase.result]).toBeTruthy();
        }
    });
}

describe('validateConditionalHeaders util function ::', () => {
    Object.keys(basicTestCases).forEach(header => {
        describe(`"${header}" basic cases:`, () => {
            checkSuccess(header);
            checkFailure(header);
        });
    });
    describe('combined cases:', () => {
        combinedCases.forEach(testCase => {
            checkCaseResult(testCase);
        });
    });
});

describe('_checkEtagMatch function :', () => {
    const expectedSuccess = {
        present: true,
        error: null,
    };
    const listOfValues = eTagMatchValues.map(item => item.value).join();
    eTagMatchValues.forEach(item => {
        it(`should return success for ${item.desc}`, () => {
            const result = _checkEtagMatch(item.value, contentMD5);
            expect(result).toStrictEqual(expectedSuccess);
        });
    });

    it('should return success for multiple valid values', () => {
        const result = _checkEtagMatch(listOfValues, contentMD5);
        expect(result).toStrictEqual(expectedSuccess);
    });

    it('should return success for multiple valid values with comma at index 0',
        () => {
            const result = _checkEtagMatch(`,${listOfValues}`, contentMD5);
            expect(result).toStrictEqual(expectedSuccess);
        });

    it('should return success as long as one value in list is valid',
        () => {
            const result = _checkEtagMatch(`${listOfValues},aaa`, contentMD5);
            expect(result).toStrictEqual(expectedSuccess);
        });

    const failTests = [
        { desc: 'if only value does not match', value: 'aaa' },
        { desc: 'for list of non-matching values', value: 'aaa,bbb,ccc' },
    ];
    failTests.forEach(test => {
        it(`should return PreconditionFailed ${test.desc}`, () => {
            const result = _checkEtagMatch(test.value, contentMD5);
            expect(result.error.is.PreconditionFailed).toBeTruthy();
        });
    });
});

describe('_checkEtagNoneMatch function :', () => {
    eTagMatchValues.forEach(item => {
        it(`should return NotModified for ${item.desc}`, () => {
            const result = _checkEtagNoneMatch(item.value, contentMD5);
            expect(result.error.is.NotModified).toBeTruthy();
        });

        it(`should return NotModified if ${item.desc} is in a list of ` +
          'otherwise non-matching values',
        () => {
            const result = _checkEtagNoneMatch(`aaa,${item.value},bbb`,
                contentMD5);
            expect(result.error.is.NotModified).toBeTruthy();
        });
    });

    it('should return success for multiple non-matching values', () => {
        const result = _checkEtagNoneMatch('aaa,bbb,ccc', contentMD5);
        expect(result).toStrictEqual(expectedSuccess);
    });

    it('should return success for multiple non-matching values ' +
    'with comma at index 0', () => {
        const result = _checkEtagNoneMatch(',aaa,bbb,ccc', contentMD5);
        expect(result).toStrictEqual(expectedSuccess);
    });
});

describe('_checkModifiedSince function :', () => {
    it('should return InvalidArgument if header has invalid value', () => {
        const result = _checkModifiedSince('aaaa', lastModified);
        expect(result.error.is.InvalidArgument).toBeTruthy();
    });

    it('should return success if header value is earlier to than last modified',
        () => {
            const result = _checkModifiedSince(beforeLastModified, lastModified);
            expect(result).toStrictEqual(expectedSuccess);
        });

    it('should return NotModified if header value is later than last modified',
        () => {
            const result = _checkModifiedSince(afterLastModified, lastModified);
            expect(result.error.is.NotModified).toBeTruthy();
        });

    it('should return NotModified if header value is equal to last modified',
        () => {
            const result = _checkModifiedSince(lastModified, lastModified);
            expect(result.error.is.NotModified).toBeTruthy();
        });
});

describe('_checkUnmodifiedSince function :', () => {
    it('should return InvalidArgument if header has invalid value', () => {
        const result = _checkUnmodifiedSince('aaaa', lastModified);
        expect(result.error.is.InvalidArgument).toBeTruthy();
    });

    it('should return PreconditionFailed if header value is earlier than ' +
    'last modified', () => {
        const result = _checkUnmodifiedSince(beforeLastModified, lastModified);
        expect(result.error.is.PreconditionFailed).toBeTruthy();
    });

    it('should return success if header value is later to than last modified',
        () => {
            const result = _checkUnmodifiedSince(afterLastModified, lastModified);
            expect(result).toStrictEqual(expectedSuccess);
        });

    it('should return success if header value is equal to last modified',
        () => {
            const result = _checkUnmodifiedSince(lastModified, lastModified);
            expect(result).toStrictEqual(expectedSuccess);
        });
});
