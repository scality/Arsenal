'use strict'; // eslint-disable-line

const async = require('async');
const assert = require('assert');
const TransportTemplate =
      require('../../../lib/network/kmip/transport/TransportTemplate.js');
const { logger, EchoChannel } = require('../../utils/kmip/ersatz.js');

describe('KMIP Transport Template Class', () => {
    const pipelineDepths = [1, 2, 4, 8, 16, 32];
    const requestNumbers = [1, 37, 1021, 8191];

    pipelineDepths.forEach(pipelineDepth => {
        requestNumbers.forEach(iterations => {
            it(`should survive ${iterations} iterations` +
               ` with ${pipelineDepth}way pipeline`,
               done => {
                   const transport = new TransportTemplate(
                       new EchoChannel,
                       {
                           pipelineDepth,
                           tls: {
                               port: 5696,
                           },
                       });
                   const request = new Buffer(10).fill(6);
                   async.times(iterations, (n, next) => {
                       transport.send(logger, request,
                                      (err, conversation, response) => {
                                          if (err) {
                                              return next(err);
                                          }
                                          if (request.compare(response) !== 0) {
                                              return next(Error('arg'));
                                          }
                                          return next();
                                      });
                   }, () => {
                       transport.end();
                       done();
                   });
               });

            [true, false].forEach(doEmit => {
                it('should report errors to outstanding requests.' +
                   ` w:${pipelineDepth}, i:${iterations}, e:${doEmit}`,
                   done => {
                       const echoChannel = new EchoChannel;
                       echoChannel.clog();
                       const transport = new TransportTemplate(
                           echoChannel,
                           {
                               pipelineDepth,
                               tls: {
                                   port: 5696,
                               },
                           });
                       const request = new Buffer(10).fill(6);
                       for (let i = 0; i < iterations; ++i) {
                           transport.send(
                               logger, request,
                               (err, conversation, response) => {
                                   assert(err);
                                   assert(!response);
                               });
                       }
                       if (doEmit) {
                           echoChannel.emit('error', new Error('awesome'));
                       } else {
                           transport.abortPipeline(echoChannel);
                       }
                       transport.end();
                       done();
                   });
            });
        });
    });
});
