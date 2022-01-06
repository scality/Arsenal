export function reshapeExceptionError(error: any) {
    const { message, code, stack, name } = error;
    return {
        message,
        code,
        stack,
        name,
    };
}
