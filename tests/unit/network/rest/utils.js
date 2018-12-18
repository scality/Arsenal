'use strict'; // eslint-disable-line

const assert = require('assert');
const constants = require('../../../../lib/constants');
const { parseURL } = require('../../../../lib/network/rest/utils');

describe('parseURL function', () => {
    [
        {
            inputUrl: `${constants.passthroughFileURL}/test`,
            expectedKey: 'test',
        },
        {
            inputUrl: `${constants.passthroughFileURL}/test with spaces`,
            expectedKey: 'test with spaces',
        },
        {
            inputUrl: `${constants.passthroughFileURL}` +
                '/test%20with%20encoded%20spaces',
            expectedKey: 'test with encoded spaces',
        },
    ].forEach(testCase => {
        const { inputUrl, expectedKey } = testCase;

        it(`should return ${expectedKey} with url "${inputUrl}"`,
        () => {
            const pathInfo = parseURL(inputUrl, true);
            assert.strictEqual(pathInfo.key, expectedKey);
        });
    });
});
