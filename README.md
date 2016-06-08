# Arsenal

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

## Clustering

The clustering class can be used to set up a cluster of worker. The class will
create at least 1 worker, will log any worker event (started, exited).
The class has also a watchdog who will restart workers until the stop() method
was called.

### Usage

```
import { Clustering } from 'arsenal';

const clusters = new Clustering(clusterSize, logger);
clusters.start(i => {
    // Put here the logic of every worker.
    // 'i' is the index of the worker
});
```

The callback will be called every time a worker is started/restarted.