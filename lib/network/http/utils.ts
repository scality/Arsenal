import * as os from 'os';
import errors, { ArsenalError } from '../../errors';

/**
 * Parse the Range header into an object
 *
 * @param rangeHeader - The 'Range' header value

 * @return object containing a range specification, with
 * either of:
 * - start and end attributes: a fully specified range request
 * - a single start attribute: no end is specified in the range request
 * - a suffix attribute: suffix range request
 * - an error attribute of type errors.InvalidArgument if the range
 *     syntax is invalid
 */
export function parseRangeSpec(
    rangeHeader: string
):
    | { error: ArsenalError }
    | { suffix: number }
    | { start: number; end?: number } {
    const rangeMatch = /^bytes=([0-9]+)?-([0-9]+)?$/.exec(rangeHeader);
    if (rangeMatch) {
        const rangeValues = rangeMatch.slice(1, 3);
        if (rangeValues[0] === undefined) {
            if (rangeValues[1] !== undefined) {
                return { suffix: Number.parseInt(rangeValues[1], 10) };
            }
        } else {
            const rangeSpec: { start: number; end?: number } =
                { start: Number.parseInt(rangeValues[0], 10) };
            if (rangeValues[1] === undefined) {
                return rangeSpec;
            }
            rangeSpec.end = Number.parseInt(rangeValues[1], 10);
            if (rangeSpec.start <= rangeSpec.end) {
                return rangeSpec;
            }
        }
    }
    return { error: errors.InvalidArgument };
}

/**
 * Convert a range specification as given by parseRangeSpec() into a
 * fully specified absolute byte range
 *
 * @param rangeSpec - Parsed range specification as returned
 *   by parseRangeSpec()
 * @param objectSize - Total byte size of the whole object

 * @return object containing either:
 * - a 'range' attribute which is a fully specified byte range [start,
       end], as the inclusive absolute byte range to request from the
       object
 * - or no attribute if the requested range is a valid range request
       for a whole empty object (non-zero suffix range)
 * - or an 'error' attribute of type errors.InvalidRange if the
 *     requested range is out of object's boundaries.
 */
export function getByteRangeFromSpec(
    rangeSpec: { suffix: number } | { start: number; end?: number },
    objectSize: number
): { error: ArsenalError } | { range: [number, number] } | {} {
    if ('suffix' in rangeSpec) {
        if (rangeSpec.suffix === 0) {
            // 0-byte suffix is always invalid (even on empty objects)
            return { error: errors.InvalidRange };
        }
        if (objectSize === 0) {
            // any other suffix range on an empty object returns the
            // full object (0 bytes)
            return {};
        }
        return { range: [Math.max(objectSize - rangeSpec.suffix, 0),
            objectSize - 1] };
    }
    if (rangeSpec.start < objectSize) {
        // test is false if end is undefined
        return { range: [rangeSpec.start,
            ((rangeSpec.end && (rangeSpec.end < objectSize)) ?
            rangeSpec.end : objectSize - 1)] };
    }
    return { error: errors.InvalidRange };
}

/**
 * Convenience function that combines parseRangeSpec() and
 * getByteRangeFromSpec()
 *
 * @param rangeHeader - The 'Range' header value
 * @param objectSize - Total byte size of the whole object

 * @return object containing either:
 * - a 'range' attribute which is a fully specified byte range [start,
 *     end], as the inclusive absolute byte range to request from the
 *     object
 * - or no attribute if the requested range is either syntactically
 *     incorrect or is a valid range request for an empty object
 *     (non-zero suffix range)
 * - or an 'error' attribute instead of type errors.InvalidRange if
 *     the requested range is out of object's boundaries.
 */
 export function parseRange(
     rangeHeader: string,
     objectSize: number
 ): { range: [number, number] } | {} | { error: ArsenalError } {
    const rangeSpec = parseRangeSpec(rangeHeader);
    if ('error' in rangeSpec) {
        // invalid range syntax is silently ignored in HTTP spec,
        // hence returns the whole object
        return {};
    }
    return getByteRangeFromSpec(rangeSpec, objectSize);
}

export function checkSupportIPv6() {
    const niList = os.networkInterfaces();
    return Object.keys(niList).some((network) =>
        niList[network]?.some(intfc => intfc.family === 'IPv6'));
}
