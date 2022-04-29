import errors from '../../errors';

export function explodePath(path: string) {
    const pathMatch = /^(\/[a-zA-Z0-9]+)(\/([0-9a-f]*))?$/.exec(path);
    if (pathMatch) {
        return {
            service: pathMatch[1],
            key: (pathMatch[3] !== undefined && pathMatch[3].length > 0 ?
                pathMatch[3] : undefined),
        };
    }
    throw errors.InvalidURI.customizeDescription('malformed URI');
};
