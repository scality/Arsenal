export type HeadersRecord = Record<string, unknown>;

export declare function normalizeHeaderValue(value: unknown): string;
export declare function normalizeHeaders<T extends HeadersRecord>(
    headers: T,
    options?: { mutate?: boolean }
): T;
export declare function createNormalizeHeadersMiddleware(): (next: any) => (args: any) => Promise<any>;
