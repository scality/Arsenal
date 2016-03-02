# IronMan-Arsenal

Common utilities for the IronMan project components

Within this repository, you will be able to find the shared libraries for the
multiple components making up the whole Project.

* [Guidelines](#guidelines)
* [Shuffle](#shuffle) to shuffle an array.
* [Errors](#errors) load an object of errors instances.
    - [errors/arsenalErrors.json](errors/arsenalErrors.json)

## Guidelines

Please read our coding and workflow guidelines at
[scality/IronMan-Guidelines](https://github.com/scality/IronMan-Guidelines).

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
