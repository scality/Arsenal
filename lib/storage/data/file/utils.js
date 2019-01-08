const posixFadvise = require('fcntl');

/**
 * Release free cached pages associated with a file
 *
 * @param {String} filePath - absolute path of the associated file
 * @param {Int} fd - file descriptor of the associated file
 * @param {werelogs.RequestLogger} log - logging object
 * @return {undefined}
 */
function releasePageCacheSync(filePath, fd, log) {
    const ret = posixFadvise(fd, 0, 0, 4);
    if (ret !== 0) {
        log.warning(
        `error fadv_dontneed ${filePath} returned ${ret}`);
    }
}

module.exports = releasePageCacheSync;
