// This module declare the interface for simple-glob.
//   simple-glob should probably be discarded in favor of node-glob.
//   node-glob is an up to date glob implementation, with support for sync and
//   async, and well maintained by the community.
//   node-glob is performance oriented and is a little lighter than simple-glob.
declare module 'simple-glob' {
    export default function (pattern: string | string[]): string[];
}
