/* eslint-disable @typescript-eslint/no-explicit-any */

import joi from 'joi';

export type Callback<Data = any> = (err?: Error | null | undefined, data?: Data) => void;

export type Credentials = { access: string; secret: string };
export type Base = {
    arn: string;
    canonicalID: string;
    shortid: string;
    email: string;
    keys: Credentials[];
};
export type Account = Base & { name: string; users: any[] };
export type Accounts = { accounts: Account[] };
export type Entity = Base & { accountDisplayName: string };

const keys = ((): joi.ArraySchema => {
    const str = joi.string().required();
    const items = { access: str, secret: str };
    return joi.array().items(items).required();
})();

const account = joi.object<Account>({
    name: joi.string().required(),
    email: joi.string().email().required(),
    arn: joi.string().required(),
    canonicalID: joi.string().required(),
    shortid: joi
        .string()
        .regex(/^[0-9]{12}$/)
        .required(),
    keys,
    // backward-compat
    users: joi.array(),
});

const accounts = joi.object<Accounts>({
    accounts: joi
        .array()
        .items(account)
        .required()
        .unique('arn')
        .unique('email')
        .unique('canonicalID'),
});

export const validators = { keys, account, accounts };
