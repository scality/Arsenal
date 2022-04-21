import { errors } from '../../../../index';
import { responseXMLBody, responseJSONBody } from '../../../../lib/s3routes/routesUtils';

import werelogs from 'werelogs';
const logger = new werelogs.Logger('test:routesUtils.responseStreamData');

describe('responseXMLBody: ', () => {
    it('Should include invalid arguments in reponse body', done => {
        const invalidArgument1 = { ArgumentName: 'argumentName1', ArgumentValue: 'argumentValue1' };
        const invalidArgument2 = { ArgumentName: 'argumentName2', ArgumentValue: 'argumentValue2' };
        const error = errors.InvalidArgument.addMetadataEntry('invalidArguments',
            [invalidArgument1, invalidArgument2]);
        responseXMLBody(error, '', {
            setHeader: () => {},
            writeHead: () => {},
            on: () => {},
            once: () => {},
            emit: () => {},
            write: () => {},
            end: (xmlStr) => {
                expect(xmlStr.includes('<ArgumentName1>argumentName1</ArgumentName1>'));
                expect(xmlStr.includes('<ArgumentValue1>argumentValue1</ArgumentValue1>'));
                expect(xmlStr.includes('<ArgumentName2>argumentName2</ArgumentName2>'));
                expect(xmlStr.includes('<ArgumentValue2>argumentValue1</ArgumentValue2>'));
                return done();
            },
        }, logger.newRequestLogger());
    })

    it('Should not include invalid arguments in reponse body', done => {
        const error = errors.InvalidArgument;
        responseXMLBody(error, '', {
            setHeader: () => {},
            writeHead: () => {},
            on: () => {},
            once: () => {},
            emit: () => {},
            write: () => {},
            end: (xmlStr) => {
                expect(xmlStr.includes('<ArgumentName1></ArgumentName1>'));
                expect(xmlStr.includes('<ArgumentValue1></ArgumentValue1>'));
                return done();
            },
        }, logger.newRequestLogger());
    })
});

describe('JSONResponseBackend: ', () => {
    it('Should include invalid arguments in reponse body', done => {
        const invalidArgument1 = { ArgumentName: 'argumentName1', ArgumentValue: 'argumentValue1' };
        const invalidArgument2 = { ArgumentName: 'argumentName2', ArgumentValue: 'argumentValue2' };
        const error = errors.InvalidArgument.addMetadataEntry('invalidArguments',
            [invalidArgument1, invalidArgument2]);
        responseJSONBody(error, '', {
            setHeader: () => {},
            writeHead: () => {},
            on: () => {},
            once: () => {},
            emit: () => {},
            write: () => {},
            end: (jsonStr) => {
                const response = JSON.parse(jsonStr);
                expect(response).toHaveProperty('ArgumentName1', 'argumentName1');
                expect(response).toHaveProperty('ArgumentValue1', 'argumentValue1');
                expect(response).toHaveProperty('ArgumentName2', 'argumentName2');
                expect(response).toHaveProperty('ArgumentValue2', 'argumentValue2');
                return done();
            },
        }, logger.newRequestLogger());
    })

    it('Should not include invalid arguments in reponse body', done => {
        const error = errors.InvalidArgument;
        responseJSONBody(error, '', {
            setHeader: () => {},
            writeHead: () => {},
            on: () => {},
            once: () => {},
            emit: () => {},
            write: () => {},
            end: (jsonStr) => {
                const response = JSON.parse(jsonStr);
                expect(response.ArgumentName1).toBeFalsy();
                expect(response.ArgumentValue1).toBeFalsy();
                return done();
            },
        }, logger.newRequestLogger());
    })
});
