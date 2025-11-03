
export type LimitConfiguration = {
    Limit: number;
};

export type RateLimitConfigurationMetadata = {
    RequestsPerSecond?: LimitConfiguration
};

export default class RateLimitConfiguration {
    private readonly _data: RateLimitConfigurationMetadata;

    constructor(obj: RateLimitConfigurationMetadata) {
        this._data = obj;
    }

    getRequestsPerSecondLimit(): number | undefined {
        return this._data.RequestsPerSecond?.Limit;
    }

    setRequestsPerSecondLimit(value: number): RateLimitConfiguration {
        this._data.RequestsPerSecond = {
            ...(this._data.RequestsPerSecond || {}),
            Limit: value,
        };

        return this;
    }

    removeRequestsPerSecondLimit(): RateLimitConfiguration {
        delete this._data.RequestsPerSecond;
        return this;
    }

    getData(): RateLimitConfigurationMetadata {
        return this._data;
    }
}
