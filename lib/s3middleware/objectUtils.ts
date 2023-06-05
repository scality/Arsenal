const msInOneDay = 24 * 60 * 60 * 1000; // Milliseconds in a day.

export const getMD5Buffer = (base64MD5: WithImplicitCoercion<string> | Uint8Array) =>
    base64MD5 instanceof Uint8Array ? base64MD5 : Buffer.from(base64MD5, 'base64')

export const getHexMD5 = (base64MD5: WithImplicitCoercion<string> | Uint8Array) =>
    getMD5Buffer(base64MD5).toString('hex');

export const getBase64MD5 = (hexMD5: WithImplicitCoercion<string>) =>
    Buffer.from(hexMD5, 'hex').toString('base64');


/**
 * Calculates the number of scaled milliseconds per day based on the given time progression factor.
 * This function is intended for testing and simulation purposes only.
 * @param {number} timeProgressionFactor - The desired time progression factor for scaling.
 * @returns {number} The number of scaled milliseconds per day.
 * If the result is 0, the minimum value of 1 millisecond is returned.
 */
export const scaleMsPerDay = (timeProgressionFactor: number): number =>
    Math.round(msInOneDay / (timeProgressionFactor || 1)) || 1;
