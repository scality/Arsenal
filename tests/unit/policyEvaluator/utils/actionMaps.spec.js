const assert = require('assert');
const {
    actionMapBP,
    actionMapBucketNotif,
    actionMapRQ,
    actionMonitoringMapS3,
} = require('../../../../lib/policyEvaluator/utils/actionMaps');

describe('bucket notification destination methods in the action maps', () => {
    const monitoringNames = {
        notificationDestinationCreate: 'CreateBucketNotificationDestination',
        notificationDestinationUpdate: 'UpdateBucketNotificationDestination',
        notificationDestinationGet: 'GetBucketNotificationDestination',
        notificationDestinationDelete: 'DeleteBucketNotificationDestination',
        notificationDestinationList: 'ListBucketNotificationDestinations',
    };

    it('should export the five methods with their IAM actions, and nothing else', () => {
        assert.deepStrictEqual(actionMapBucketNotif, {
            notificationDestinationCreate: 'scality:CreateBucketNotificationDestination',
            notificationDestinationUpdate: 'scality:UpdateBucketNotificationDestination',
            notificationDestinationGet: 'scality:GetBucketNotificationDestination',
            notificationDestinationDelete: 'scality:DeleteBucketNotificationDestination',
            notificationDestinationList: 'scality:ListBucketNotificationDestinations',
        });
    });

    Object.entries(monitoringNames).forEach(([apiMethod, name]) => {
        it(`should give ${apiMethod} the monitoring name ${name}`, () => {
            assert.strictEqual(actionMonitoringMapS3[apiMethod], name);
        });
    });

    it('should keep the methods out of the request map and the bucket policy map', () => {
        [actionMapRQ, actionMapBP].forEach(map => {
            Object.keys(monitoringNames).forEach(apiMethod => {
                assert.strictEqual(map[apiMethod], undefined);
            });
        });
    });
});
