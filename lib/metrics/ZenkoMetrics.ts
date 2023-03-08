import promClient from 'prom-client';

// const collectDefaultMetricsIntervalMs =
//     process.env.COLLECT_DEFAULT_METRICS_INTERVAL_MS !== undefined ?
//         Number.parseInt(process.env.COLLECT_DEFAULT_METRICS_INTERVAL_MS, 10) :
//         10000;

// promClient.collectDefaultMetrics({ timeout: collectDefaultMetricsIntervalMs });

export default class ZenkoMetrics {
    static createCounter(params: any) {
        return new promClient.Counter(params);
    }

    static createGauge(params: any) {
        return new promClient.Gauge(params);
    }

    static createHistogram(params: any) {
        return new promClient.Histogram(params);
    }

    static createSummary(params: any) {
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
