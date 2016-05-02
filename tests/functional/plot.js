'use strict'; // eslint-disable-line strict

const Plotter = require('../../lib/plotter');

describe('Plot functional test', () => {
    it('simple plot with .json config file', done => {
        process.env.PLOTTER_CONFIG_FILE = `${__dirname}/simple.json`;
        const plotter = new Plotter();
        plotter.plotData(done);
    });

    it('simple plot with config assigned via argument', done => {
        const config = {
            method: 'simple',
            dataFile: 'data.txt',
            output: 'simple_arg',
            dataFolder: './tests/functional/test',
            xCol: 1,
            yCols: [2, 3, [4, 5], 6],
            font: 'CMR14',
            fontSize: 14,
            title: 'Simple plot',
            xLabel: 'x-axis label',
            yLabel: 'y-axis label',
            lineTitle: ['Test1', 'Test2', 'Test 3', 'Test 4'],
            message: 'Functional test for plotter, config via argument',
            grid: 'xtics ytics',
            styleData: 'linespoints',
            lineSize: 1,
            pointSize: 1,
            legendPos: 'top left',
        };
        const plotter = new Plotter(config);
        plotter.plotData(done);
    });

    it('multiplot with .json config file', done => {
        process.env.PLOTTER_CONFIG_FILE = `${__dirname}/multiplot.json`;
        const plotter = new Plotter();
        plotter.plotData(done);
    });

    it('multiplot with config assigned via argument', done => {
        const config = {
            method: 'multiplot',
            nbGraphsPerRow: 3,
            nbGraphsPerCol: 2,
            width: 10,
            height: 5,
            dataFile: 'data.txt',
            output: 'multiplot_arg',
            dataFolder: './tests/functional',
            xCol: [1, 1, 1, 1, 1, 1],
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
        };
        const plotter = new Plotter(config);
        plotter.plotData(done);
    });
});
