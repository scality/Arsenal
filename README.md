# IronMan-Arsenal

Common utilities for the IronMan project components

Within this repository, you will be able to find the shared libraries for the
multiple components making up the whole Project.

* [Guidelines](#guidelines)
* [Shuffle](#shuffle) to shuffle an array.
* [Errors](#errors) load an object of errors instances.
    - [errors/arsenalErrors.json](errors/arsenalErrors.json)
* [Plotter] (#plotter) plot graphs from data files

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

## Plotter

It supports to plot a simple graph or multiple graphs.

- Simple graph: only one graph is plotted
- Multiplot: multiple graphs are plotted

Before plotting graph, we need define config parameters for Plotter vian
a '.json' file or an object.

### Usage

``` js
import Plotter from 'arsenal';
```

#### Use '.json' file

This file should have the following structure:

```javascript
{
    "dataFolder": "./tests/functional", // REQUIRED
    "dataFile": "data.txt",             // REQUIRED
    "output": "simple_file",            // REQUIRED
    "method": "simple", // or "multiplot", optional, default "simple"
    "width": 12,        // optional, default 29.7cm
    "height": 10,       // optional, default 21cm
    // for simple plot, xCol must be an positive  number
    "xCol": 1,                          // optional, default 1
    // for simple plot, yCol must be an array. Each element must be either a
    //  number or an array of length 2. In the latter case, a line with
    //  yerrorbars will be plotted
    "yCols": [2, 3, [4, 5], 6],         // optional, default [2]
    "font": "CMR14",                    // optional, default CMR14
    "fontSize": 14,                     // optional, default 12
    "title": "Simple plot",             // optional, default 'title'
    "xLabel": "x-axis label",           // optional, default 'xLabel'
    "yLabel": "y-axis label",           // optional, default 'yLabel'
    "lineTitle": ["Test1", "Test2", "Test 3", "Test 4"],    // optional
    "message": "Functional test for plotter, use config file", // optional
    "grid": "xtics ytics",              // optional, default 'xtics ytics'
    "styleData": "linespoints",         // optional, default 'linespoints'
    "lineSize": 1,                      // optional, default 1
    "pointSize": 1,                     // optional, default 1
    "legendPos": "top right"            // optional default "top right"
}
```

Then, plot graph by

```javascript
process.env.PLOTTER_CONFIG_FILE = 'path_to_the_json_config_file';
const plotter = new Plotter();
plotter.plotData(err => {
    if (err) {
        // error occurs
    }
    // plot's done
})
```

#### Use object

Define an object containing parameters for Plotter:

```javascript
const config = {
    dataFolder: './tests/functional',
    dataFile: 'data.txt',
    output: 'multiplot_arg',
    method: 'multiplot',
    nbGraphsPerRow: 3,
    nbGraphsPerCol: 2,
    width: 10,
    height: 5,
    // for multiple plot, xCol must be an array of 1 element or
    //  nbGraphsPerRow * nbGraphsPerCol elements. In the first case, x-axis
    //  is the same for all graphs
    xCol: [1, 1, 1, 1, 1, 1],
    // for multiple plot, yCol must be an array of
    //  nbGraphsPerRow * nbGraphsPerCol elements. Each element must be either a
    //  number or an array. In the latter case, the array can contains either
    //  positive number or array of length 2 (same as simple plot)
    yCols: [[2, 3], 3, [[4, 5]], [4, 6], [2, 5], [6]],
    graphsOrder: 'rowsfirst',
    font: 'CMR14',
    fontSize: 14,
    title: 'Multiplot',
    xLabel: ['xLabel1', 'xLabel2', 'xLabel3', 'xLabel4', 'xLabel5',
                'xLabel6'],
    yLabel: ['yLabel1', 'yLabel2', 'yLabel3', 'yLabel4', 'yLabel5',
                'yLabel6'],
    lineTitle: [['Col2', 'Col3'], ['Col3'], ['Col4-5'],
                ['Col4', 'Col6'], ['Col2', 'Col5'], ['Col6']],
    message: 'Functional test for plotter, config via argument',
    grid: 'xtics ytics',
    styleData: 'linespoints',
    lineSize: 1,
    pointSize: 1,
    legendPos: 'top left',
}
```

Then, plot graph by

```javascript
const plotter = new Plotter(config);
plotter.plotData(err => {
    if (err) {
        // error occurs
    }
    // plot's done
})
```
