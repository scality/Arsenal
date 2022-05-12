export interface ErrorLike {
    message: any;
    code: any;
    stack: any;
    name: any;
}

export function reshapeExceptionError(error: ErrorLike) {
    const { message, code, stack, name } = error;
    return { message, code, stack, name };
}
