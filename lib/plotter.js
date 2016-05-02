'use strict'; // eslint-disable-line strict

const fs = require('fs');
const spawn = require('child_process').spawn;
const stderr = process.stderr;

const simple = 'simple';
const multiplot = 'multiplot';

function getConfig() {
    let config;
    let configFilePath;
    if (process.env.PLOTTER_CONFIG_FILE !== undefined) {
        configFilePath = process.env.PLOTTER_CONFIG_FILE;
    } else {
        configFilePath = './config.json';
    }

    try {
        const data = fs.readFileSync(configFilePath, { encoding: 'utf-8' });
        config = JSON.parse(data);
    } catch (err) {
        throw new Error(`could not parse config file: ${err.message}`);
    }
    return config;
}

class Plotter {
    /**
     * @param {Object} _config: configuration for plotter
     * @return {this} Plotter
     */
    constructor(_config) {
        const config = _config || getConfig();

        if (!config) {
            throw new Error('missing config for Plotter\n');
        }

        if (!config.dataFile) {
            throw new Error('missing data file in config\n');
        }
        if (!config.output) {
            throw new Error('missing name for output files in config\n');
        }

        this.gnuExt = '.gnu';
        this.outputExt = '.pdf';

        this.method = config.method || simple;

        // folder where data, gnu, output files locate
        this.dataFolder = config.dataFolder;

        this.dataFile = `${this.dataFolder}/${config.dataFile}`;
        this.output = `${this.dataFolder}/${config.output}${this.outputExt}`;
        this.gnuFile = `${this.dataFolder}/${config.output}${this.gnuExt}`;

        // data column for x-axis
        this.xCol = config.xCol || 1;
        // data column for y-axis
        this.yCols = config.yCols || [2];
        // data can be given as an array instead of froma data file
        this.data = config.data;

        // graph config
        this.width = config.width || 29.7;
        this.height = config.height || 21;
        this.font = config.font || 'CMR14';
        this.fontSize = config.fontSize || 12;
        this.title = config.title || 'title';
        this.xLabel = config.xLabel || 'xLabel';
        this.yLabel = config.yLabel || 'yLabel';
        this.lineTitle = config.lineTitle;
        this.message = config.message.replace(/\n#/g, '\\n').replace(/#/g, '');
        this.grid = config.grid || 'xtics ytics';
        this.styleData = config.styleData || 'linespoints';
        this.lineSize = config.lineSize || 1;
        this.pointSize = config.pointSize || 1;
        this.legendPos = config.legendPos || 'top left';

        /* for multiplot */
        this.nbGraphsPerCol = config.nbGraphsPerCol || 1;
        this.nbGraphsPerRow = config.nbGraphsPerRow || 1;
        this.nbGraphs = this.nbGraphsPerCol * this.nbGraphsPerRow;
        this.graphsOrder = config.graphsOrder || 'rowsfirst';
        this.layout = `${this.nbGraphsPerCol},${this.nbGraphsPerRow}`;

        // graph size
        this.size = `${this.width * this.nbGraphsPerRow}cm,` +
                    `${this.height * this.nbGraphsPerCol}cm`;

        this.checkConsistentParams(err => {
            if (err) {
                throw new Error(err);
            }
        });
    }

    checkConsistentParams(cb) {
        if (!this.dataFolder) {
            throw new Error('missing folder storing data, .gnu and ' +
                            'output files\n');
        }
        if (this.dataFile === undefined && !this.data) {
            throw new Error('missing data for Plotter\n');
        } else if (this.dataFile) {
            try {
                fs.statSync(this.dataFile);
            } catch (e) {
                throw new Error(e);
            }
        }
        if (this.method === simple && isNaN(this.xCol) || this.xCol < 1) {
            return cb('\'xCol\' must be a positive number\n');
        }
        if (!Array.isArray(this.yCols)) {
            return cb('\'yCols\' must be an array of column indices\n');
        }
        if (!this.lineTitle) {
            this.lineTitle = new Array(this.yCols.length);
        } else if (this.lineTitle &&
            this.lineTitle.length !== this.yCols.length) {
            return cb('\'yCols\' and \'lineTitle\' must have a same length\n');
        }
        if (this.styleData !== 'lines' && this.styleData !== 'points' &&
            this.styleData !== 'linespoints') {
            return cb('\'styleData\' must be either \'lines\', \'points\'' +
                        'or \'linespoints\'\n');
        }
        if (this.method === multiplot) {
            if (!Array.isArray(this.xCol) ||
                this.xCol.length !== this.nbGraphs) {
                return cb(`'xCol' must be an array of ${this.nbGraphs} nbs\n`);
            }
            if (!Array.isArray(this.yCols) ||
                this.yCols.length !== this.nbGraphs) {
                return cb('\'yCols\' must be an array of ' +
                    `${this.nbGraphs} elements\n`);
            }
            this.yCols.forEach((yCol, yColIdx) => {
                if (!Array.isArray(yCol)) {
                    if (!isNaN(yCol)) {
                        this.yCols[yColIdx] = [yCol];
                    } else {
                        return cb(`Element ${yCol} of \'yCols\' must be ` +
                                    'either a number of an array\n');
                    }
                }
                return undefined;
            });
            if (this.graphsOrder !== 'rowsfirst' &&
                this.graphsOrder !== 'columnsfirst') {
                return cb('\'graphsOrder\' must be either \'rowsfirst\'' +
                            'or \'columnsfirst\'\n');
            }
            if (!Array.isArray(this.xLabel) ||
                this.xLabel.length !== this.nbGraphs) {
                this.xLabel = (new Array(this.nbGraphs)).fill(this.xLabel);
            }
            if (!Array.isArray(this.yLabel) ||
                this.yLabel.length !== this.nbGraphs) {
                this.yLabel = (new Array(this.nbGraphs)).fill(this.yLabel);
            }
        }
        return undefined;
    }

    genLegend() {
        return `${new Date()}\\n${this.message}\\n`;
    }

    /**
     * function creates .gnu command to plot data on columns of a data file
     * @param {string} file: data file name
     * @param {array} cols: [col1, col2, col3]
     * @param {array} every: [firstLine, step, lastLine]
     * @param {string} title: curve title
     * @param {string} type: 'lines' or 'points' or 'linespoints'
     * @param {number} color: curve color
     * @param {boolean} nextFlag: fasle -> last line
     * @param {number} lt: curve line type
     * @param {number} lw: curve line weight
     * @param {number} ps: curve point size
     * @param {array} fit: [func, title] for fit
     * @return {this} this
     */
    plotLine(file, cols, every, title, type, color, nextFlag, lt, lw, ps, fit) {
        const _type = type || 'linespoints';
        const _lt = lt || 1;
        const _lw = lw || 2;
        const _ps = ps || 1;
        let str;

        let _title;
        if (title) {
            _title = `title '${title}'`;
        } else {
            _title = 'notitle';
        }

        let _every = '';
        if (every) {
            if (every.length === 2) {
                _every = `every ${every[1]}::${every[0]} `;
            } else if (every.length === 3) {
                _every = `every ::${every[0]}::${every[2]} `;
            }
        }

        str = `"${file}" ${_every} u ${cols[0]}:${cols[1]} ` +
                `${_title} w ${_type} lc ${color} lt ${_lt} lw ${_lw}`;
        if (type === 'points' || type === 'linespoints') {
            str += ` pt ${color}  ps ${_ps}`;
        }
        if (cols[2]) {
            str += `, "${file}" ${_every} u ${cols[0]}:${cols[1]}:${cols[2]} ` +
                `notitle w yerrorbars lc ${color} lt ${_lt} lw ${_lw} ` +
                `pt ${color} ps ${_ps}`;
        }

        if (fit) {
            str += `,\ ${fit[0]} title ${fit[1]}`;
        }

        if (nextFlag) {
            str += ',\\';
        }
        str += `\n`;
        return str;
    }

    /**
    * Function creates .gnu files that plots a graph of one or multiple lines
    * If yCol is an array of two elements, it will plot with errorbars where
    * the first element is average, the second one is standard-deviation
    * @param {function} cb: callback function
    * @return {function} callback
     */
    simple(cb) {
        let color = 1;
        let content =
            `set terminal pdfcairo size ${this.size} enhanced color ` +
                `font "${this.font}, ${this.fontSize}"\n` +
            `set key ${this.legendPos} Left reverse box width 3 height 1.5\n` +
            `set style data ${this.styleData}\n` +
            `set xlabel '${this.xLabel}'\n` +
            `set ylabel '${this.yLabel}'\n` +
            `set grid ${this.grid}\n` +
            `set title "${this.title}\\n${this.message}"\n` +
            `set output '${this.output}'\n` +
            'plot ';
        this.yCols.forEach((yCol, yColIdx) => {
            let xyAxis = [this.xCol, yCol];
            if (Array.isArray(yCol) && yCol.length === 2) {
                xyAxis = [this.xCol, yCol[0], yCol[1]];
            }
            content += this.plotLine(this.dataFile, xyAxis, null,
                `${this.lineTitle[yColIdx]}`, this.styleData, color,
                yColIdx < this.yCols.length - 1, null, this.lineSize,
                this.pointSize);
            color++;
        });
        content += `\n`;
        fs.writeFile(this.gnuFile, content, cb);
    }

    /**
    * function creates .gnu files that plots a graph of one or multiple lines
    * with yerrorbars
    * @param {function} cb: callback function
    * @return {function} callback
     */
    multiplot(cb) {
        let color = 1;
        let content =
            `set terminal pdfcairo size ${this.size} enhanced color ` +
                `font "${this.font}, ${this.fontSize}"\n` +
            'set key top left Left reverse box width 3 height 1.5\n' +
            `set style data ${this.styleData}\n` +
            `set xlabel '${this.xLabel}'\n` +
            `set ylabel '${this.yLabel}'\n` +
            `set grid ${this.grid}\n` +
            `set output '${this.output}'\n` +
            `set multiplot layout ${this.layout} ${this.graphsOrder} ` +
            `title "${this.title}\\n${this.message}"\n`;
        this.yCols.forEach((yCol, yColIdx) => {
            content +=
                `unset xlabel; set xlabel '${this.xLabel[yColIdx]}'\n` +
                `unset ylabel; set ylabel '${this.yLabel[yColIdx]}'\n` +
                'plot ';
            yCol.forEach((_yCol, _yColIdx) => {
                let xyAxis = [this.xCol[yColIdx], _yCol];
                if (Array.isArray(_yCol) && _yCol.length === 2) {
                    xyAxis = [this.xCol[yColIdx], _yCol[0], _yCol[1]];
                }
                content += this.plotLine(this.dataFile, xyAxis, null,
                    `${this.lineTitle[yColIdx][_yColIdx]}`, this.styleData,
                    color, _yColIdx < yCol.length - 1, null, this.lineSize,
                    this.pointSize);
                color++;
            });
            content += `\n`;
        });
        content += `\n`;
        content += `unset multiplot; set output\n`;
        fs.writeFile(this.gnuFile, content, cb);
    }

    createAllGnuFiles(cb) {
        let createGnuFile;
        if (this.method === simple) {
            createGnuFile = this.simple.bind(this);
        }
        if (this.method === multiplot) {
            createGnuFile = this.multiplot.bind(this);
        }
        createGnuFile(cb);
    }

    plotData(cb) {
        stderr.write('plotting..');
        this.createAllGnuFiles(err => {
            if (err) {
                cb(err); return;
            }
            const cmd = `gnuplot ${this.gnuFile}`;

            const gnuplot = spawn('bash', ['-c', cmd]);
            gnuplot.on('exit', () => {
                stderr.write(`done\n`);
                return cb();
            });

            gnuplot.on('error', err => {
                stderr.write(`gnuplot error: ${err}\n`);
                return cb(err);
            });
        });
    }
}

module.exports = Plotter;
