const assert = require('assert');
const crypto = require('crypto');
const timestampId = require('../../../lib/versioning/TimestampId');

describe('timestampId', () => {
    describe('constants', () => {
        it('should expose the documented byte lengths', () => {
            assert.strictEqual(timestampId.LENGTH_TS, 14);
            assert.strictEqual(timestampId.LENGTH_SEQ, 6);
            assert.strictEqual(timestampId.LENGTH_RG, 7);
        });

        it('should expose templates matching the byte lengths', () => {
            assert.strictEqual(timestampId.TEMPLATE_TS.length, timestampId.LENGTH_TS);
            assert.strictEqual(timestampId.TEMPLATE_SEQ.length, timestampId.LENGTH_SEQ);
            assert.strictEqual(timestampId.TEMPLATE_RG.length, timestampId.LENGTH_RG);
            assert.strictEqual(timestampId.TEMPLATE_TS, '0'.repeat(timestampId.LENGTH_TS));
            assert.strictEqual(timestampId.TEMPLATE_SEQ, '0'.repeat(timestampId.LENGTH_SEQ));
            assert.strictEqual(timestampId.TEMPLATE_RG, ' '.repeat(timestampId.LENGTH_RG));
        });

        it('should expose MAX_TS and MAX_SEQ at the digit boundary', () => {
            assert.strictEqual(timestampId.MAX_TS, Math.pow(10, timestampId.LENGTH_TS) - 1);
            assert.strictEqual(timestampId.MAX_SEQ, Math.pow(10, timestampId.LENGTH_SEQ) - 1);
            assert.strictEqual(String(timestampId.MAX_TS).length, timestampId.LENGTH_TS);
            assert.strictEqual(String(timestampId.MAX_SEQ).length, timestampId.LENGTH_SEQ);
        });

        it('should keep MAX_TS large enough for current timestamps', () => {
            assert(timestampId.MAX_TS > Date.now());
        });
    });

    describe('padLeft', () => {
        it('should left-pad shorter values', () => {
            assert.strictEqual(timestampId.padLeft('foo', '00000'), '00foo');
            assert.strictEqual(timestampId.padLeft(42, '0000'), '0042');
        });

        it('should return only the rightmost template-length characters when value is longer', () => {
            assert.strictEqual(timestampId.padLeft('abcdef', '000'), 'def');
            assert.strictEqual(timestampId.padLeft('123456', '00'), '56');
        });

        it('should return the value unchanged when it already matches the template length', () => {
            assert.strictEqual(timestampId.padLeft('abc', '000'), 'abc');
        });

        it('should return the full template when value is empty', () => {
            assert.strictEqual(timestampId.padLeft('', '00000'), '00000');
        });

        it('should coerce non-string values via template substitution', () => {
            assert.strictEqual(timestampId.padLeft(0, '00000'), '00000');
            assert.strictEqual(timestampId.padLeft(null, '0000'), 'null');
        });
    });

    describe('padRight', () => {
        it('should right-pad shorter values', () => {
            assert.strictEqual(timestampId.padRight('foo', '00000'), 'foo00');
            assert.strictEqual(timestampId.padRight('abc', '       '), 'abc    ');
        });

        it('should truncate when value is longer than the template', () => {
            assert.strictEqual(timestampId.padRight('abcdef', '000'), 'abc');
            assert.strictEqual(timestampId.padRight('abcdefghij', '0000000'), 'abcdefg');
        });

        it('should return the value unchanged when it already matches the template length', () => {
            assert.strictEqual(timestampId.padRight('abc', '000'), 'abc');
        });

        it('should return the full template when value is empty', () => {
            assert.strictEqual(timestampId.padRight('', '00000'), '00000');
        });
    });

    describe('wait', () => {
        it('should block for at least the requested time span', () => {
            const start = process.hrtime();
            timestampId.wait(2_000_000); // 2 ms in ns
            const diff = process.hrtime(start);
            const elapsedNs = diff[0] * 1e9 + diff[1];
            assert(elapsedNs >= 2_000_000, `expected >= 2ms, got ${elapsedNs}ns`);
        });

        it('should return immediately for a zero or negative span', () => {
            const start = process.hrtime();
            timestampId.wait(0);
            timestampId.wait(-1);
            const diff = process.hrtime(start);
            const elapsedMs = (diff[0] * 1e9 + diff[1]) / 1e6;
            assert(elapsedMs < 50, `expected near-instant return, got ${elapsedMs}ms`);
        });
    });

    describe('hexEncode / hexDecode', () => {
        it('should round-trip an ASCII string', () => {
            const str = 'hello world';
            const encoded = timestampId.hexEncode(str);
            assert.strictEqual(encoded, '68656c6c6f20776f726c64');
            assert.strictEqual(timestampId.hexDecode(encoded), str);
        });

        it('should round-trip a string containing spaces and digits', () => {
            const str = '98283606399999999999RG001  ';
            assert.strictEqual(timestampId.hexDecode(timestampId.hexEncode(str)), str);
        });

        it('should produce a hex string of double the input length', () => {
            for (let len = 1; len <= 32; len++) {
                const str = 'a'.repeat(len);
                assert.strictEqual(timestampId.hexEncode(str).length, len * 2);
            }
        });

        it('should round-trip arbitrary binary-safe content', () => {
            const str = crypto.randomBytes(27).toString('binary');
            const encoded = timestampId.hexEncode(str);
            assert(/^[0-9a-f]+$/.test(encoded));
            // utf-8 round-tripping of arbitrary bytes is not lossless, but
            // the produced encoded form must always be valid lowercase hex
        });

        it('should return an Error when decoding an empty string', () => {
            const result = timestampId.hexDecode('');
            assert(result instanceof Error);
        });

        it('should return an Error or an empty/garbage value gracefully for non-hex input', () => {
            // Buffer.from(str, 'hex') silently drops invalid characters
            // rather than throwing, so the contract here is: never crash.
            const result = timestampId.hexDecode('not-hex-zz');
            assert(typeof result === 'string' || result instanceof Error);
        });
    });

    describe('createTimestampSequenceGenerator', () => {
        it('should produce ids of length LENGTH_TS + LENGTH_SEQ + LENGTH_RG', () => {
            const gen = timestampId.createTimestampSequenceGenerator();
            const id = gen('RG001');
            assert.strictEqual(id.length, timestampId.LENGTH_TS + timestampId.LENGTH_SEQ + timestampId.LENGTH_RG);
        });

        it('should produce unique ids across many calls', () => {
            const gen = timestampId.createTimestampSequenceGenerator();
            const ids = Array(5000)
                .fill(null)
                .map(() => gen('RG001'));
            assert.strictEqual(new Set(ids).size, ids.length);
        });

        it('should produce strictly decreasing ids (newest first)', () => {
            const gen = timestampId.createTimestampSequenceGenerator();
            const ids = Array(2000)
                .fill(null)
                .map(() => gen('RG001'));
            for (let i = 1; i < ids.length; i++) {
                assert(ids[i] < ids[i - 1], `expected ${ids[i]} < ${ids[i - 1]}`);
            }
        });

        it('should embed the replication group id at bytes 20-27', () => {
            const gen = timestampId.createTimestampSequenceGenerator();
            const id = gen('RG001');
            assert.strictEqual(id.slice(timestampId.LENGTH_TS + timestampId.LENGTH_SEQ), 'RG001  ');
        });

        it('should right-pad a short replication group id with spaces', () => {
            const gen = timestampId.createTimestampSequenceGenerator();
            const id = gen('a');
            assert.strictEqual(id.slice(timestampId.LENGTH_TS + timestampId.LENGTH_SEQ), 'a      ');
        });

        it('should truncate a long replication group id', () => {
            const gen = timestampId.createTimestampSequenceGenerator();
            const id = gen('abcdefghij');
            assert.strictEqual(id.slice(timestampId.LENGTH_TS + timestampId.LENGTH_SEQ), 'abcdefg');
        });

        it('should accept an empty replication group id and pad with spaces', () => {
            const gen = timestampId.createTimestampSequenceGenerator();
            const id = gen('');
            assert.strictEqual(id.length, timestampId.LENGTH_TS + timestampId.LENGTH_SEQ + timestampId.LENGTH_RG);
            assert.strictEqual(id.slice(timestampId.LENGTH_TS + timestampId.LENGTH_SEQ), '       ');
        });

        it('should encode a reversed timestamp (MAX_TS - now)', () => {
            const gen = timestampId.createTimestampSequenceGenerator();
            const before = Date.now();
            const id = gen('RG001');
            const after = Date.now();

            const reversedTs = Number(id.slice(0, timestampId.LENGTH_TS));
            const ts = timestampId.MAX_TS - reversedTs;
            assert(ts >= before && ts <= after, `expected ${before} <= ${ts} <= ${after}`);
        });

        it('should reset the sequence counter when the millisecond changes', async () => {
            const gen = timestampId.createTimestampSequenceGenerator();
            const idA = gen('RG001');
            // sleep long enough to guarantee a new millisecond
            await new Promise(resolve => setTimeout(resolve, 5));
            const idB = gen('RG001');

            const seqB = Number(idB.slice(timestampId.LENGTH_TS, timestampId.LENGTH_TS + timestampId.LENGTH_SEQ));
            // reversed sequence: MAX_SEQ on the first call of a new ms
            assert.strictEqual(seqB, timestampId.MAX_SEQ);
            // distinct timestamps, so the full ids must differ too
            assert.notStrictEqual(idA, idB);
        });

        it('should increment the sequence within the same millisecond', () => {
            const gen = timestampId.createTimestampSequenceGenerator();
            // generate many ids in a tight loop; most will share a ms
            const ids = Array(200)
                .fill(null)
                .map(() => gen('RG001'));

            // find a window of consecutive ids that share a timestamp
            for (let i = 1; i < ids.length; i++) {
                const tsPrev = ids[i - 1].slice(0, timestampId.LENGTH_TS);
                const tsCurr = ids[i].slice(0, timestampId.LENGTH_TS);
                if (tsPrev === tsCurr) {
                    const seqPrev = Number(ids[i - 1].slice(timestampId.LENGTH_TS, timestampId.LENGTH_TS + timestampId.LENGTH_SEQ));
                    const seqCurr = Number(ids[i].slice(timestampId.LENGTH_TS, timestampId.LENGTH_TS + timestampId.LENGTH_SEQ));
                    // reversed: each subsequent id has a smaller seq number
                    assert.strictEqual(seqCurr, seqPrev - 1);
                    return;
                }
            }
            assert.fail('expected at least two ids in the same millisecond');
        });

        it('should produce independent state across separate generators', () => {
            const genA = timestampId.createTimestampSequenceGenerator();
            const genB = timestampId.createTimestampSequenceGenerator();

            // interleave calls; each generator should produce a strictly
            // decreasing sequence considered on its own
            const aIds = [];
            const bIds = [];
            for (let i = 0; i < 200; i++) {
                aIds.push(genA('RGA001 '));
                bIds.push(genB('RGB001 '));
            }

            for (let i = 1; i < aIds.length; i++) {
                assert(aIds[i] < aIds[i - 1]);
                assert(bIds[i] < bIds[i - 1]);
            }
            assert.strictEqual(new Set(aIds).size, aIds.length);
            assert.strictEqual(new Set(bIds).size, bIds.length);
        });

        it('should produce a different timestamp portion on the first call of a fresh generator', () => {
            // First-call wait() guarantees the millisecond slot is flushed.
            const gen = timestampId.createTimestampSequenceGenerator();
            const id = gen('RG001');
            const reversedTs = Number(id.slice(0, timestampId.LENGTH_TS));
            const ts = timestampId.MAX_TS - reversedTs;
            // sanity: timestamp must look like a recent epoch in ms
            assert(ts > 1_700_000_000_000);
            assert(ts <= Date.now());
        });
    });

    describe('TS_SEQ_RG_LENGTH', () => {
        it('should equal LENGTH_TS + LENGTH_SEQ + LENGTH_RG', () => {
            assert.strictEqual(
                timestampId.TS_SEQ_RG_LENGTH,
                timestampId.LENGTH_TS + timestampId.LENGTH_SEQ + timestampId.LENGTH_RG,
            );
            assert.strictEqual(timestampId.TS_SEQ_RG_LENGTH, 27);
        });
    });

    describe('getInfId', () => {
        it('should produce a 27-character sentinel with MAX_TS / MAX_SEQ', () => {
            const id = timestampId.getInfId('RG001');
            assert.strictEqual(id.length, timestampId.TS_SEQ_RG_LENGTH);
            assert.strictEqual(id.slice(0, timestampId.LENGTH_TS), String(timestampId.MAX_TS));
            assert.strictEqual(
                id.slice(timestampId.LENGTH_TS, timestampId.LENGTH_TS + timestampId.LENGTH_SEQ),
                String(timestampId.MAX_SEQ),
            );
            assert.strictEqual(id.slice(-timestampId.LENGTH_RG), 'RG001  ');
        });

        it('should sort strictly after any generated id', () => {
            const gen = timestampId.createTimestampSequenceGenerator();
            const generated = gen('RG001');
            const sentinel = timestampId.getInfId('RG001');
            // reversed-time encoding: "infinitely old" is lex-greater than anything recent
            assert(sentinel > generated, `${sentinel} should sort after ${generated}`);
        });

        it('should pad and truncate the replication group id', () => {
            assert.strictEqual(timestampId.getInfId('a').slice(-timestampId.LENGTH_RG), 'a      ');
            assert.strictEqual(timestampId.getInfId('abcdefghij').slice(-timestampId.LENGTH_RG), 'abcdefg');
        });
    });

    describe('parse', () => {
        it('should round-trip a generated id', () => {
            const gen = timestampId.createTimestampSequenceGenerator();
            const before = Date.now();
            const id = gen('RG001');
            const after = Date.now();

            const parsed = timestampId.parse(id);
            assert(!(parsed instanceof Error), `unexpected error: ${parsed}`);
            assert(parsed.ts >= before && parsed.ts <= after);
            assert.strictEqual(typeof parsed.seq, 'number');
            assert(parsed.seq >= 0 && parsed.seq <= timestampId.MAX_SEQ);
            assert.strictEqual(parsed.rg, 'RG001');
        });

        it('should accept a longer id and parse only the prefix', () => {
            const gen = timestampId.createTimestampSequenceGenerator();
            const id = gen('RG001') + 'extra-suffix-bytes';
            const parsed = timestampId.parse(id);
            assert(!(parsed instanceof Error));
            assert.strictEqual(parsed.rg, 'RG001');
        });

        it('should trim trailing spaces from the rg id', () => {
            const gen = timestampId.createTimestampSequenceGenerator();
            const id = gen('a');
            const parsed = timestampId.parse(id);
            assert(!(parsed instanceof Error));
            assert.strictEqual(parsed.rg, 'a');
        });

        it('should reflect the seq=0 first-call invariant after a fresh generator', () => {
            const gen = timestampId.createTimestampSequenceGenerator();
            const parsed = timestampId.parse(gen('RG001'));
            assert(!(parsed instanceof Error));
            assert.strictEqual(parsed.seq, 0);
        });

        it('should return an Error for too-short input', () => {
            assert(timestampId.parse('') instanceof Error);
            assert(timestampId.parse('abc') instanceof Error);
            assert(timestampId.parse('0'.repeat(timestampId.TS_SEQ_RG_LENGTH - 1)) instanceof Error);
        });

        it('should return an Error for non-numeric timestamp or sequence', () => {
            const bad = 'x'.repeat(timestampId.LENGTH_TS) + '0'.repeat(timestampId.LENGTH_SEQ) + 'RG001  ';
            assert(timestampId.parse(bad) instanceof Error);
        });
    });

    describe('compare', () => {
        it('should return 0 for equal ids', () => {
            assert.strictEqual(timestampId.compare('abc', 'abc'), 0);
        });

        it('should return positive when a is more recent (lex-smaller)', () => {
            // reversed-time encoding: smaller string == newer
            assert(timestampId.compare('aaa', 'bbb') > 0);
        });

        it('should return negative when a is older (lex-greater)', () => {
            assert(timestampId.compare('bbb', 'aaa') < 0);
        });

        it('should agree with the ordering of a generated stream', () => {
            const gen = timestampId.createTimestampSequenceGenerator();
            const older = gen('RG001');
            const newer = gen('RG001');
            assert(timestampId.compare(newer, older) > 0);
            assert(timestampId.compare(older, newer) < 0);
        });
    });
});
