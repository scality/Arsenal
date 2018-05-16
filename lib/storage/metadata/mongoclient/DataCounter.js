function deepCopyObject(obj) {
    return JSON.parse(JSON.stringify(obj));
}
/*
    To-do: parallel safety?
*/
class DataCounter {
    constructor() {
        this.objects = 0;
        this.versions = 0;
        this.buckets = 0;
        this.bucketList = [];
        this.dataManaged = {
            total: { curr: 0, prev: 0 },
            byLocation: {},
        };
    }

    set(setVal) {
        if (setVal) {
            this.objects = setVal.objects;
            this.versions = setVal.versions;
            this.buckets = setVal.buckets;
            this.bucketList = [...setVal.bucketList];
            this.dataManaged = deepCopyObject(setVal.dataManaged);
        }
    }

    addObject(objVal, preVal, isVersioned) {
        // types of change
        // new master, replace master, add to versioning case 1
        // new master, replace master (suspended versioning) case 2
        // new master, replace master (non-vesioning)
        // new object, case 1
        // new master, replace master (delete marker) case 1
        if (preVal) {
            if (isVersioned) {
                ++this.versions;
                this.dataManaged.total.prev += preVal['content-length'];
            }
            this.dataManaged.total.curr -= preVal['content-length'];
            preVal.locations.forEach(dataStoreName => {
                if (this.dataManaged.byLocation[dataStoreName]) {
                    this.dataManaged.byLocation[dataStoreName].curr -=
                    preVal['content-length'];
                    if (isVersioned) {
                        this.dataManaged.byLocation[dataStoreName].prev +=
                        preVal['content-length'];
                    }
                }
            });
        } else {
            ++this.objects;
        }
        if (!objVal.isDeleteMarker) {
            this.dataManaged.total.curr += objVal['content-length'];
            objVal.locations.forEach(dataStoreName => {
                if (this.dataManaged.byLocation[dataStoreName]) {
                    this.dataManaged.byLocation[dataStoreName].curr +=
                    objVal['content-length'];
                }
            });
        }
    }

    delObject(objVal, isMaster) {
        let type;
        if (isMaster) {
            --this.objects;
            type = 'curr';
        } else {
            --this.versions;
            type = 'prev';
        }
        this.dataManaged.total[type] -= objVal['content-length'];
        objVal.locations.forEach(dataStoreName => {
            if (this.dataManaged.byLocation[dataStoreName]) {
                this.dataManaged.byLocation[dataStoreName][type] -=
                objVal['content-length'];
            }
        });
    }

    results() {
        const obj = {
            objects: this.objects,
            versions: this.versions,
            buckets: this.buckets,
            bucketList: this.bucketList,
            dataManaged: this.dataManaged,
        };
        return deepCopyObject(obj);
    }
}

module.exports = DataCounter;
