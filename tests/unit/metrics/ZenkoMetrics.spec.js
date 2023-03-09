const assert = require('assert');

const ZenkoMetrics = require('../../../lib/metrics/ZenkoMetrics').default;

describe('ZenkoMetrics', () => {
    let counter;
    let gauge;
    let histogram;
    let summary;
    let petCounter;

    beforeAll(() => {
        counter = ZenkoMetrics.createCounter({
            name: 'gizmo_counter',
            help: 'Count gizmos',
        });
        counter.inc();
        counter.inc(10);

        gauge = ZenkoMetrics.createGauge({
            name: 'gizmo_gauge',
            help: 'Measure gizmos',
        });
        gauge.set(42);
        gauge.inc();
        gauge.dec(10);

        histogram = ZenkoMetrics.createHistogram({
            name: 'gizmo_histogram',
            help: 'Make a histogram of gizmos',
            buckets: [1, 10, 100],
        });
        histogram.observe(5);
        histogram.observe(15);
        histogram.observe(50);
        histogram.observe(500);

        summary = ZenkoMetrics.createSummary({
            name: 'gizmo_summary',
            help: 'Make a summary of gizmos',
            percentiles: [0.05, 0.5, 0.95],
        });
        summary.observe(5);
        summary.observe(50);
        summary.observe(500);

        petCounter = ZenkoMetrics.createCounter({
            name: 'pet_counter',
            help: 'Count pets',
            labelNames: ['type'],
        });
        petCounter.inc({ type: 'kitten' });
        petCounter.inc({ type: 'puppy' }, 2);
    });

    it('should keep created metrics objects in registry', () => {
        const savedCounter = ZenkoMetrics.getMetric('gizmo_counter');
        // check we get the same original counter object
        assert.strictEqual(savedCounter, counter);

        const savedGauge = ZenkoMetrics.getMetric('gizmo_gauge');
        // check we get the same original gauge object
        assert.strictEqual(savedGauge, gauge);

        assert.strictEqual(ZenkoMetrics.getMetric('does_not_exist'), undefined);
    });

    it('should export metrics in prometheus format', async () => {
        const expectedLines = [
            '# HELP gizmo_counter Count gizmos',
            '# TYPE gizmo_counter counter',
            'gizmo_counter 11',
            '# HELP gizmo_gauge Measure gizmos',
            '# TYPE gizmo_gauge gauge',
            'gizmo_gauge 33',
            '# HELP gizmo_histogram Make a histogram of gizmos',
            '# TYPE gizmo_histogram histogram',
            'gizmo_histogram_bucket{le="1"} 0',
            'gizmo_histogram_bucket{le="10"} 1',
            'gizmo_histogram_bucket{le="100"} 3',
            'gizmo_histogram_bucket{le="+Inf"} 4',
            'gizmo_histogram_sum 570',
            'gizmo_histogram_count 4',
            '# HELP gizmo_summary Make a summary of gizmos',
            '# TYPE gizmo_summary summary',
            'gizmo_summary{quantile="0.05"} 5',
            'gizmo_summary{quantile="0.5"} 50',
            'gizmo_summary{quantile="0.95"} 500',
            'gizmo_summary_sum 555',
            'gizmo_summary_count 3',
            '# HELP pet_counter Count pets',
            '# TYPE pet_counter counter',
            'pet_counter{type="kitten"} 1',
            'pet_counter{type="puppy"} 2',
        ];
        const lines = {};
        const metrics = await ZenkoMetrics.asPrometheus();
        metrics.split('\n').forEach(line => {
            lines[line.trimEnd()] = true;
        });
        expectedLines.forEach(expectedLine => {
            assert.notStrictEqual(
                lines[expectedLine], undefined,
                `missing expected line in Prometheus export '${expectedLine}'`);
        });
    });
});
