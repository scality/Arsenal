type status = {
    paused: boolean,
    scheduledResume: string|null,
};

type serviceStatus = {
    crr: status|null,
    ingestion: status|null,
    lifecycle: status|null,
};

/**
 * Class to manage a location's pause/resume state on its
 * different services.
 * Current supported services are : crr, ingestion, lifecycle
 */
export default class LocationStatus {
    _data: serviceStatus;

    /**
     * @constructor
     * @param services services to init
     * @param locationStatus initial location status values
     */
    constructor(services: string[], locationStatus?: {
        crr: serviceStatus|null,
        ingestion: serviceStatus|null,
        lifecycle: serviceStatus|null,
    } | serviceStatus) {
        this._data = this._initStatus(services);
        if (locationStatus) {
            const data = locationStatus instanceof LocationStatus ?
                locationStatus._data : locationStatus;
            Object.keys(this._data).forEach(svc => {
                this._data[svc] = {
                    paused: data[svc]?.paused || false,
                    scheduledResume: data[svc]?.scheduledResume || null
                }
            });
        }
    }

    /**
     * Initializes the status of all services
     * The default status of a service is unpaused
     * @returns {LocationServiceStatus}
     */
    _initStatus(servicesToInit: string[]): serviceStatus {
        const initStatus = {
            paused: false,
            scheduledResume: null,
        };
        return {
            crr: servicesToInit.includes('crr') ? initStatus : null,
            ingestion: servicesToInit.includes('ingestion') ? initStatus : null,
            lifecycle: servicesToInit.includes('lifecycle') ? initStatus : null,
        };
    }

    /**
     * initializes a service status
     * @param service service name
     */
    _initService(service: string) {
        this._data[service] = {
            paused: false,
            scheduledResume: null,
        };
    }

    /**
     * @param service service name
     * @param paused true if paused
     */
    setServicePauseStatus(service: string, paused: boolean) {
        if (Object.keys(this._data).includes(service)) {
            if (!this._data[service]) {
                this._initService(service);
            }
            this._data[service].paused = paused;
        }
    }

    /**
     * @param service service name
     * @returns true if paused
     */
    getServicePauseStatus(service: string) : boolean | null {
        if (!this._data[service]) {
            return null;
        }
        return this._data[service].paused;
    }

    /**
     * @param service service name
     */
    setServiceResumeSchedule(service: string, date: Date | null) {
        if (this._data[service]) {
            if (date !== null) {
                this._data[service].scheduledResume = date.toString();
            } else {
                this._data[service].scheduledResume = null;
            }
        }
    }

    /**
     * @param service service name
     * @returns scheduled resume date
     */
    getServiceResumeSchedule(service: string) : Date | null {
        const schedule = this._data[service].scheduledResume;
        if (!schedule) {
            return null;
        }
        return new Date(schedule);
    }

    /**
     * @param service service(s) name
     */
    pauseLocation(service: string | string[]) {
        const servicesList = Array.isArray(service) ?
            service : [service];
        servicesList.forEach(svc => {
            if (!this.getServicePauseStatus(svc)) {
                this.setServicePauseStatus(svc, true);
            }
        });
    }

    /**
     * @param service service(s) name
     * @param schedule date to resume service(s)
     */
    resumeLocation(service: string | string[], schedule?: Date) {
        const servicesList = Array.isArray(service) ?
            service : [service];
        servicesList.forEach(svc => {
            if (!this.getServicePauseStatus(svc)) {
                return;
            }
            let shouldPause = false;
            if (schedule) {
                shouldPause = true
            }
            this.setServicePauseStatus(svc, shouldPause);
            this.setServiceResumeSchedule(svc, schedule||null);
        });
    }

    /**
     * @return location status object
     */
    getValue() : serviceStatus{
        return this._data;
    }

    /**
     * @returns serialized location status data
     */
    getSerialized() : string {
        return JSON.stringify(this.getValue());
    }
}
