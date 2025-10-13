
export type RateLimitConfigurationMetadata = {
    requestsPerSecond?: number;
}

export default class RateLimitConfiguration {
    private data: RateLimitConfigurationMetadata

    constructor(obj?: RateLimitConfigurationMetadata) {
        this.data = {
            requestsPerSecond: obj?.requestsPerSecond
        };
    }

    getValue() {
        return this.data;
    }

    getRequestsPerSecond() {
        return this.data.requestsPerSecond;
    }

    setRequestsPerSecond(value: number) {
        this.data.requestsPerSecond = value;
    }
}
