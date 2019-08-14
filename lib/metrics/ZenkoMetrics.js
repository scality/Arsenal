const promClient = require('prom-client');

const collectDefaultMetricsIntervalMs =
      process.env.COLLECT_DEFAULT_METRICS_INTERVAL_MS !== undefined ?
      Number.parseInt(process.env.COLLECT_DEFAULT_METRICS_INTERVAL_MS, 10) :
      10000;

// promClient.collectDefaultMetrics({ timeout: collectDefaultMetricsIntervalMs });

class ZenkoMetrics {
    static createCounter(params) {
        return new promClient.Counter(params);
    }

    static createGauge(params) {
        return new promClient.Gauge(params);
    }

    static createHistogram(params) {
        return new promClient.Histogram(params);
    }

    static createSummary(params) {
        return new promClient.Summary(params);
    }

    static getMetric(name) {
        return promClient.register.getSingleMetric(name);
    }

    static asPrometheus() {
        return promClient.register.metrics();
    }

    static asPrometheusContentType() {
        return promClient.register.contentType;
    }
}

module.exports = ZenkoMetrics;
