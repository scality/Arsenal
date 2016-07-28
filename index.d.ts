interface Ciphers {
    ciphers: string;
}

interface Dhparam {
    dhparam: string;
}

declare module "arsenal" {
    namespace https {
        var ciphers: Ciphers;
        var dhparam: Dhparam;
    }
}
