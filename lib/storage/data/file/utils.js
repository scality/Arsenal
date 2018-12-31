const fs = require('fs');
const posixFadvise = require('fcntl');

/**
 * Release free cached pages associated with a file
 *
 * @param {String} filePath - absolute path of the associated file
 * @param {Int} fd - file descriptor of the associated file. If null,
 *    filePath will be opened to get the file descriptor
 * @param {werelogs.RequestLogger} log - logging object
 * @return {undefined}
 */
function releasePageCacheSync(filePath, fd, log) {
    function release(filePath, fd, log) {
        const ret = posixFadvise(fd, 0, 0, 4);
        if (ret !== 0) {
            log.warning(
            `error fadv_dontneed ${filePath} returned ${ret}`);
        }
    }
    if (fd === null) {
        fs.open(filePath, 'r', (err, fd) => {
            if (err) {
                log.error('error opening file', { filePath, error: err });
            }
            release(filePath, fd, log);
            fs.close(fd);
        });
        return undefined;
    }
    return release(filePath, fd, log);
}

module.exports = releasePageCacheSync;
