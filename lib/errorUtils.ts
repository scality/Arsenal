export function reshapeExceptionError(error) {
    const { message, code, stack, name } = error;
    return {
        message,
        code,
        stack,
        name,
    };
}
