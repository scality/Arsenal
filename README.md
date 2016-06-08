# Arsenal

[![CircleCI][badgepub]](https://circleci.com/gh/scality/Arsenal)
[![Scality CI][badgepriv]](http://ci.ironmann.io/gh/scality/Arsenal)

Common utilities for the S3 project components

Within this repository, you will be able to find the shared libraries for the
multiple components making up the whole Project.

* [Guidelines](#guidelines)
* [Shuffle](#shuffle) to shuffle an array.
* [Errors](#errors) load an object of errors instances.
    - [errors/arsenalErrors.json](errors/arsenalErrors.json)

## Guidelines

Please read our coding and workflow guidelines at
[scality/Guidelines](https://github.com/scality/Guidelines).

### Contributing

In order to contribute, please follow the
[Contributing Guidelines](
https://github.com/scality/Guidelines/blob/master/CONTRIBUTING.md).

## Shuffle

### Usage

``` js
import { shuffle } from 'arsenal';

let array = [1, 2, 3, 4, 5];

shuffle(array);

console.log(array);

//[5, 3, 1, 2, 4]
```

## Errors

### Usage

``` js
import { errors } from 'arsenal';

console.log(errors.AccessDenied);

//{ [Error: AccessDenied]
//    code: 403,
//    description: 'Access Denied',
//    AccessDenied: true }

```

[badgepub]: https://circleci.com/gh/scality/Arsenal.svg?style=svg
[badgepriv]: http://ci.ironmann.io/gh/scality/Arsenal.svg?style=svg&circle-token=c3d2570682cba6763a97ea0bc87521941413d75c
