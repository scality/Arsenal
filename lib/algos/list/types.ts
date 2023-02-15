export type MDParams = {
    limit ?: number,
    gte ?: string,
    lt : string,
    gt ?: string,
    lastModified ?: { lt: string }, 
};

export type ResultObject = {
    Contents: {
        key: string;
        value: string;
    }[];
    IsTruncated: boolean;
    NextKeyMarker ?: string;
};
