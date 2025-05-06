import { ArsenalError } from './errors';

export interface ArsenalCallback<T> {
    (err: null, result: T): void;
    (err: void): void;
    (err: ArsenalError): void;
};

type Primitive = string | number | boolean | symbol | null | undefined | bigint;

type StripKey<K extends PropertyKey, P extends PropertyKey> =
    K extends `${Exclude<P, symbol>}.${infer R}` ? R : never;

export type NestedOmit<T, K extends PropertyKey> =
    T extends Primitive | Function
        ? T
        : T extends Array<infer U>
            ? Array<NestedOmit<U, K>>
            : {
                [P in keyof T as P extends Extract<K, string> ? never : P]:
                    NestedOmit<T[P], StripKey<K, P>>;
            };
