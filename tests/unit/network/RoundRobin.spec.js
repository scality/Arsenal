const assert = require('assert');

const RoundRobin = require('../../../lib/network/RoundRobin');

describe('round robin hosts', () => {
    let roundRobin;

    [{
        caption: 'with { host, port } objects in list',
        hostsList: [{ host: '1.2.3.0', port: 1000 },
                    { host: '1.2.3.1', port: 1001 },
                    { host: '1.2.3.2', port: 1002 }],
    }, {
        caption: 'with "host:port" strings in list',
        hostsList: ['1.2.3.0:1000',
                    '1.2.3.1:1001',
                    '1.2.3.2'],
    }].forEach(testCase => describe(testCase.caption, () => {
        beforeEach(() => {
            roundRobin = new RoundRobin(testCase.hostsList,
                                        { stickyCount: 10 });
        });

        it('should pick all hosts in turn', () => {
            const hostsPickCount = {
                '1.2.3.0': 0,
                '1.2.3.1': 0,
                '1.2.3.2': 0,
            };

            // expect 3 loops of 10 times each of the 3 hosts
            for (let i = 0; i < 90; ++i) {
                const hostItem = roundRobin.pickHost();
                hostsPickCount[hostItem.host] =
                    hostsPickCount[hostItem.host] + 1;
            }
            assert.strictEqual(hostsPickCount['1.2.3.0'], 30);
            assert.strictEqual(hostsPickCount['1.2.3.1'], 30);
            assert.strictEqual(hostsPickCount['1.2.3.2'], 30);
        });

        it('should pick the same current host up to stickyCount ' +
        'with pickHost()', () => {
            const hostsPickCount = {
                '1.2.3.0': 0,
                '1.2.3.1': 0,
                '1.2.3.2': 0,
            };

            // the current host should be picked 10 times in a row
            const curHost = roundRobin.getCurrentHost();
            for (let i = 0; i < 10; ++i) {
                const hostItem = roundRobin.pickHost();
                hostsPickCount[hostItem.host] =
                    hostsPickCount[hostItem.host] + 1;
            }
            assert.strictEqual(hostsPickCount[curHost.host], 10);
        });

        it('should pick each host in turn with pickNextHost()', () => {
            const hostsPickCount = {
                '1.2.3.0': 0,
                '1.2.3.1': 0,
                '1.2.3.2': 0,
            };

            // expect each host to be picked up 3 times
            for (let i = 0; i < 9; ++i) {
                const hostItem = roundRobin.pickNextHost();
                hostsPickCount[hostItem.host] =
                    hostsPickCount[hostItem.host] + 1;
            }
            assert.strictEqual(hostsPickCount['1.2.3.0'], 3);
            assert.strictEqual(hostsPickCount['1.2.3.1'], 3);
            assert.strictEqual(hostsPickCount['1.2.3.2'], 3);
        });

        it('should refuse if no valid host/port is given', () => {
            assert.throws(() => new RoundRobin([]), Error);
            assert.throws(() => new RoundRobin([{}]), Error);
            assert.throws(() => new RoundRobin([
                { host: '', port: '' },
            ]), Error);
            assert.throws(() => new RoundRobin([
                { host: 'zenko.io', port: '' },
            ]), Error);
            assert.throws(() => new RoundRobin([
                { host: 'zenko.io', port: 'abcde' },
            ]), Error);
            assert.throws(() => new RoundRobin([
                { host: 'zenko.io', port: '10abcde' },
            ]), Error);
            assert.throws(() => new RoundRobin(['zenko.io:1000:bad']),
                          Error);

            // this is valid
            // eslint-disable-next-line no-new
            new RoundRobin([{ host: 'zenko.io', port: '42' }]);
            // eslint-disable-next-line no-new
            new RoundRobin(['zenko.io:42']);
            // eslint-disable-next-line no-new
            new RoundRobin(['zenko.io', 'zenka.ia']);
        });
    }));
});
