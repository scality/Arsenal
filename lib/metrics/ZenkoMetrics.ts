import promClient from 'prom-client';

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

    static collectDefaultMetrics() {
        promClient.collectDefaultMetrics();
    }
}
