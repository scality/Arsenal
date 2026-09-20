'use strict';

const assert = require('assert');

const { parseRequestTarget } = require('../../../lib/utils/requestUrl');

/*
 * These values pin the behaviour the v2 signature path and the key
 * derivation in routesUtils rely on: any change here would change what
 * gets parsed as the bucket/key or what gets signed.
 */
const cases = [
    // plain targets
    ['/bucket/key', '/bucket/key', null],
    ['/bucket/key?acl', '/bucket/key', 'acl'],
    ['/bucket/key?versionId=abc&acl', '/bucket/key', 'versionId=abc&acl'],
    ['/', '/', null],
    ['', '', null],
    ['/bucket/', '/bucket/', null],
    ['/bucket//double//slash', '/bucket//double//slash', null],

    // delimiters
    ['/bucket/key?', '/bucket/key', ''],
    ['/bucket/key?x=1#frag', '/bucket/key', 'x=1'],
    ['/bucket/key#frag?x=1', '/bucket/key', null],
    ['/bucket/key#hash', '/bucket/key', null],
    ['?onlyquery', '', 'onlyquery'],

    // percent-encoding is left exactly as the client sent it
    ['/bucket/my%20key', '/bucket/my%20key', null],
    ['/bucket/key%2Fencoded', '/bucket/key%2Fencoded', null],
    ['/bucket/key%2fencoded', '/bucket/key%2fencoded', null],
    ['/bucket/key%23hash', '/bucket/key%23hash', null],

    // whitespace and backslashes
    ['/bucket/my key', '/bucket/my%20key', null],
    ['/bucket/tab\tkey', '/bucket/tab%09key', null],
    ['/bucket/back\\slash', '/bucket/back/slash', null],
    ['  /bucket/key  ', '/bucket/key', null],

    // a '@' in the key drops the parser out of its verbatim path
    ['/bucket/key"quote', '/bucket/key"quote', null],
    ['/bucket/user@host/key"quote', '/bucket/user@host/key%22quote', null],
    ['/bucket/user@host/key{brace}', '/bucket/user@host/key%7Bbrace%7D', null],

    // backslashes separate in the path but stay literal in the query
    ['/bucket/key?a\\b', '/bucket/key', 'a\\b'],
];

describe('parseRequestTarget', () => {
    cases.forEach(([input, pathname, query]) => {
        it(`should parse ${JSON.stringify(input)}`, () => {
            const parsed = parseRequestTarget(input);
            assert.strictEqual(parsed.pathname, pathname);
            assert.strictEqual(parsed.query, query);
            assert.strictEqual(parsed.path, query === null ? pathname : `${pathname}?${query}`);
        });
    });

    /*
     * These are the cases where `new URL()` would rewrite the target. Each one
     * would change the object a request resolves to, and with it the string the
     * v2 signature is checked against.
     */
    describe('keys that WHATWG parsing would rewrite', () => {
        it('should not collapse dot segments', () => {
            assert.strictEqual(parseRequestTarget('/bucket/a/../b').pathname, '/bucket/a/../b');
            assert.strictEqual(parseRequestTarget('/bucket/a/./b').pathname, '/bucket/a/./b');
            assert.strictEqual(parseRequestTarget('/bucket/..').pathname, '/bucket/..');
        });

        it('should keep a leading // rather than read it as a host', () => {
            assert.strictEqual(parseRequestTarget('//bucket/key').pathname, '//bucket/key');
            assert.strictEqual(parseRequestTarget('///bucket/key').pathname, '///bucket/key');
        });

        it('should leave non-ASCII keys unencoded', () => {
            assert.strictEqual(parseRequestTarget('/bucket/ключ').pathname, '/bucket/ключ');
            assert.strictEqual(parseRequestTarget('/bucket/ünïcode').pathname, '/bucket/ünïcode');
        });

        it('should not drop control characters from a key', () => {
            assert.strictEqual(parseRequestTarget('/bucket/a\tb').pathname, '/bucket/a%09b');
        });
    });

    it('should never throw on input the legacy parser rejected', () => {
        ['//', ':', '\u0000', 'http://x', '/b/k?a=%'].forEach(input => {
            assert.doesNotThrow(() => parseRequestTarget(input));
        });
    });
});
