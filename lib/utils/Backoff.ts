/**
 * Minimal exponential backoff timer, replacing the unmaintained/archived
 * "backo" package (last released 2022, repo archived 2023) with the same
 * small API: constructor options, duration(), reset(). Shared across
 * Arsenal consumers (e.g. GCP MPU retries) and usable by other S3 platform
 * components with the same retry needs (e.g. Backbeat).
 */

export interface BackoffOptions {
    /** Initial timeout in milliseconds. Default: 100. */
    min?: number;
    /** Max timeout in milliseconds. Default: 10000. */
    max?: number;
    /** Exponential growth factor. Default: 2. */
    factor?: number;
    /** Randomization factor, between 0 and 1. Default: 0 (no jitter). */
    jitter?: number;
}

export default class Backoff {
    ms: number;
    max: number;
    factor: number;
    jitter: number;
    attempts: number;

    constructor(opts: BackoffOptions = {}) {
        this.ms = opts.min || 100;
        this.max = opts.max || 10000;
        this.factor = opts.factor || 2;
        this.jitter = opts.jitter && opts.jitter > 0 && opts.jitter <= 1 ? opts.jitter : 0;
        this.attempts = 0;
    }

    /**
     * Compute the next backoff duration, in milliseconds, and increment
     * the internal attempt counter.
     * @return backoff duration in milliseconds
     */
    duration(): number {
        let ms = this.ms * Math.pow(this.factor, this.attempts++);
        if (this.jitter) {
            const rand = Math.random();
            const deviation = Math.floor(rand * this.jitter * ms);
            ms = (Math.floor(rand * 10) & 1) === 0 ? ms - deviation : ms + deviation;
        }
        return Math.min(ms, this.max) | 0;
    }

    /** Reset the attempt counter. */
    reset(): void {
        this.attempts = 0;
    }
}
