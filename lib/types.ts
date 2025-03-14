import { ArsenalError } from './errors';

export interface ArsenalCallback<T> {
    (err: null, result: T): void;
    (err: void): void;
    (err: ArsenalError): void;
};
