const Client = require('prom-client');

/**
 * Wrapper for Prometheus client - https://github.com/siimon/prom-client
 */

class ClientWrapper {

    constructor() {
        this.client = Client;
    }

    /**
     * Gets all the metrics in the form of a string for prometheus server
     * @return {Object} Registers the metrics
     */
    getMetrics() {
        return this.client.register.metrics();
    }

    /**
     * Counters go up, and reset when the process restarts.
     * @param {string} metricsName - name of the metrics
     * @param {string} metricsHelp - description of metrics
     * @param {string} metricsLabels - Static labels applied to every metric
     * @return {Object}
     * Optional Parameter - metricsLabels
     */
    createCounter(metricsName, metricsHelp, metricsLabels) {
        let label;
        if (metricsLabels === undefined) {
            label = [];
        } else {
            label = metricsLabels;
        }
        return new this.client.Counter({
            name: metricsName,
            help: metricsHelp,
            labels: label,
        });
    }

    /**
     * Gauges are similar to Counters but Gauges value can be decreased.
     * @param {string} metricsName - name of the metrics
     * @param {string} metricsHelp - description of metrics
     * @param {string} metricsLabels - Static labels applied to every metric
     * @return {Object}
     * Optional Parameter - metricsLabels
     */
    createGauge(metricsName, metricsHelp, metricsLabels) {
        let label;
        if (metricsLabels === undefined) {
            label = [];
        } else {
            label = metricsLabels;
        }
        return new this.client.Gauge({
            name: metricsName,
            help: metricsHelp,
            labels: label,
        });
    }

    /**
     * Histograms track sizes and frequency of events.
     * The defaults buckets are intended to cover usual web/rpc requests,
     * this can however be overriden.
     * @param {string} metricsName - name of the metrics
     * @param {string} metricsHelp - description of metrics
     * @param {string} metricsBuckets - size of buckets for cumulative counters
     * @param {string} metricsLabels - Static labels applied to every metric
     * @return {Object}
     * Optional Parameter - metricsBuckets and metricsLabels
     */
    createHistogram(metricsName, metricsHelp, metricsBuckets, metricsLabels) {
        let label;
        let bucket;
        if (metricsBuckets === undefined) {
            bucket =
            [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
        } else {
            bucket = metricsBuckets;
        }
        if (metricsLabels === undefined) {
            label = [];
        } else {
            label = metricsLabels;
        }
        return new this.client.Histogram({
            name: metricsName,
            help: metricsHelp,
            buckets: bucket,
            labels: label,
        });
    }

    /**
     * Summaries calculate percentiles of observed values.
     * @param {string} metricsName - name of the metrics
     * @param {string} metricsHelp - description of metrics
     * @param {string} metricsPercentiles - Percentile range
     * @param {string} metricsLabels - Static labels applied to every metric
     * @return {Object}
     * Optional Parameter - metricsPercentiles and metricsLabels
     */
    createSummary(metricsName, metricsHelp, metricsPercentiles, metricsLabels) {
        let label;
        let percentile;
        if (metricsPercentiles === undefined) {
            percentile = [0.01, 0.05, 0.5, 0.9, 0.95, 0.99, 0.999];
        } else {
            percentile = metricsPercentiles;
        }
        if (metricsLabels === undefined) {
            label = [];
        } else {
            label = metricsLabels;
        }
        return new this.client.Summary({
            name: metricsName,
            help: metricsHelp,
            percentiles: percentile,
            labels: label,
        });
    }

    /**
     * Collect default metrics as recommended by prometheus
     * @return {Object} Collects the default metrics recommended by Prometheus
     */
    collectDefaultMetrics() {
        return this.client.collectDefaultMetrics();
    }
}

module.exports = ClientWrapper;
