import promClient from 'prom-client';

const collectDefaultMetricsIntervalMs =
    process.env.COLLECT_DEFAULT_METRICS_INTERVAL_MS !== undefined ?
        Number.parseInt(process.env.COLLECT_DEFAULT_METRICS_INTERVAL_MS, 10) :
        10000;

promClient.collectDefaultMetrics({ timeout: collectDefaultMetricsIntervalMs });

export default class ZenkoMetrics {
    static createCounter(params: promClient.CounterConfiguration) {
        return new promClient.Counter(params);
    }

    static createGauge(params: promClient.GaugeConfiguration) {
        return new promClient.Gauge(params);
    }

    static createHistogram(params: promClient.HistogramConfiguration) {
        return new promClient.Histogram(params);
    }

    static createSummary(params: promClient.SummaryConfiguration) {
        return new promClient.Summary(params);
    }

    static getMetric(name: string) {
        return promClient.register.getSingleMetric(name);
    }

    static asPrometheus() {
        return promClient.register.metrics();
    }

    static asPrometheusContentType() {
        return promClient.register.contentType;
    }
}
