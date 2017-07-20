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

## Clustering

The clustering class can be used to set up a cluster of workers. The class will
create at least 1 worker, will log any worker event (started, exited).
The class also provides a watchdog which restarts the workers in case of
failure until the stop() method is called.

### Usage

#### Simple

```
import { Clustering } from 'arsenal';

const cluster = new Clustering(clusterSize, logger);
cluster.start(current => {
    // Put here the logic of every worker.
    // 'current' is the Clustering instance, worker id is accessible by
    // current.getIndex()
});
```

The callback will be called every time a worker is started/restarted.

#### Handle exit

```
import { Clustering } from 'arsenal';

const cluster = new Clustering(clusterSize, logger);
cluster.start(current => {
    // Put here the logic of every worker.
    // 'current' is the Clustering instance, worker id is accessible by
    // current.getIndex()
}).onExit(current => {
    if (current.isMaster()) {
        // Master process exiting
    } else {
        const id = current.getIndex();
        // Worker (id) exiting
    }
});
```

You can handle exit event on both master and workers by calling the
'onExit' method and setting the callback. This allows release of resources
or save state before exiting the process.

#### Silencing a signal

```
import { Clustering } from 'arsenal';

const cluster = new Clustering(clusterSize, logger);
cluster.start(current => {
    // Put here the logic of every worker.
    // 'current' is the Clustering instance, worker id is accessible by
    // current.getIndex()
}).onExit((current, signal) => {
    if (signal !== 'SIGTERM') {
        process.exit(current.getStatus());
    }
});
```

You can silence stop signals, by simply not exiting on the exit callback

#### Shutdown timeout

```
import { Clustering } from 'arsenal';

const cluster = new Clustering(clusterSize, logger, 1000);
cluster.start(current => {
    // Put here the logic of every worker.
    // 'current' is the Clustering instance, worker id is accessible by
    // current.getIndex()
}).onExit((current, signal) => {
    if (signal === 'SIGTERM') {
        // releasing resources
    }
});
```

By default, the shutdown timeout is set to 5000 milliseconds. This timeout is
used only when you explicitly call the stop() method. This window is
used to let the application release its resources, but if timeout occurs
before the application has finished it's cleanup, a 'SIGKILL' signal is send
to the process (which results in an immediate termination, and this signal
can't be caught).

[badgepub]: https://circleci.com/gh/scality/Arsenal.svg?style=svg
[badgepriv]: http://ci.ironmann.io/gh/scality/Arsenal.svg?style=svg&circle-token=c3d2570682cba6763a97ea0bc87521941413d75c
