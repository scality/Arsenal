import promClient from 'prom-client';

// 'timeout' property is not needed/supported
// https://github.com/siimon/prom-client/blob/199b7d19f8c8c34ee8653264e8dc0e57b420074f/CHANGELOG.md#1200---2020-02-20
promClient.collectDefaultMetrics();

export default class ZenkoMetrics {
    static createCounter(params: promClient.CounterConfiguration<string>) {
        return new promClient.Counter(params);
    }

    static createGauge(params: promClient.GaugeConfiguration<string>) {
        return new promClient.Gauge(params);
    }

    static createHistogram(params: promClient.HistogramConfiguration<string>) {
        return new promClient.Histogram(params);
    }

    static createSummary(params: promClient.SummaryConfiguration<string>) {
        return new promClient.Summary(params);
    }

    static getMetric(name: string) {
        return promClient.register.getSingleMetric(name);
    }

    static async asPrometheus() {
        return promClient.register.metrics();
    }

    static asPrometheusContentType() {
        return promClient.register.contentType;
    }
}
