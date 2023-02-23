import { readFile } from 'node:fs/promises';

import { expect } from 'chai';

import { MongoClient } from '../mongodb';

describe('MONGODB-OIDC', function () {
  context('when running in the environment', function () {
    it('contains AWS_WEB_IDENTITY_TOKEN_FILE', function () {
      expect(process.env).to.have.property('AWS_WEB_IDENTITY_TOKEN_FILE');
    });
  });

  describe('OIDC Auth Spec Prose Tests', function () {
    // Drivers MUST be able to authenticate using OIDC callback(s) when there
    // is one principal configured.
    describe('1. Callback-Driven Auth', function () {
      // - Create a request callback that reads in the generated ``test_user1`` token file.
      const requestCallback = async () => {
        const file = readFile(`${process.env.OIDC_TOKEN_DIR}/test_user1`, { encoding: 'utf8' });
        console.log(JSON.parse(file));
        return { accessToken: '' };
      };

      context('when no username is provided', function () {
        let collection;
        // - Create a client with a url of the form  ``mongodb://localhost/?authMechanism=MONGODB-OIDC``
        //   and the OIDC request callback.
        before(function () {
          const client = new MongoClient(
            'mongodb://localhost/?authMechanism=MONGODB-OIDC',
            {
              authMechanismProperties: {
                REQUEST_TOKEN_CALLBACK: requestCallback
              }
            }
          );
          collection = client.db('testOidc').collection('test');
        });

        // - Perform a ``find`` operation.
        // - Clear the cache.
        it('successfully authenticates', async function () {
          const doc = await collection.findOne();
          expect(doc).to.equal(null);
        });
      });

      context('when a username is provided', function () {
        let collection;
        // - Create a client with a url of the form
        //   ``mongodb://test_user1@localhost/?authMechanism=MONGODB-OIDC`` and the OIDC request callback.
        before(function () {
          const client = new MongoClient(
            'mongodb://test_user1@localhost/?authMechanism=MONGODB-OIDC',
            {
              authMechanismProperties: {
                REQUEST_TOKEN_CALLBACK: requestCallback
              }
            }
          );
          collection = client.db('testOidc').collection('test');
        });

        // - Perform a ``find`` operation.
        // - Clear the cache.
        it('successfully authenticates', async function () {
          const doc = await collection.findOne();
          expect(doc).to.equal(null);
        });
      });
    });

    // Drivers MUST be able to authenticate using the "aws" device workflow simulating
    // an EC2 instance with an enabled web identity token provider, generated by
    // Drivers Evergreen Tools.
    describe('2. AWS Device Auth', function () {
      const testTokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
      let collection;
      after(() => {
        process.env.AWS_WEB_IDENTITY_TOKEN_FILE = testTokenFile;
      });

      // - Create a client with the url parameters
      //   ``?authMechanism=MONGODB-OIDC&authMechanismProperties=DEVICE_NAME=aws``.
      before(function () {
        // Set the ``AWS_WEB_IDENTITY_TOKEN_FILE`` environment variable to the location
        // of the ``test_user1`` generated token file.
        process.env.AWS_WEB_IDENTITY_TOKEN_FILE = `${process.env.OIDC_TOKEN_DIR}/test_user1`;
        const client = new MongoClient(
          'mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=DEVICE_NAME=aws'
        );
        collection = client.db('testOidc').collection('test');
      });

      // - Perform a find operation on the client.
      it('successfully authenticates', async function () {
        const doc = await collection.findOne();
        expect(doc).to.equal(null);
      });
    });

    // Drivers MUST be able to authenticate using either authentication or device
    // type if there are multiple principals configured on the server.  Note that
    // ``directConnection=true`` and ``readPreference=secondaryPreferred`` are needed
    // because the server is a secondary on a replica set, on port ``27018``.
    describe('3. Multiple Principles', function () {
      context('when authenticating with user 1', function () {
        context('when using a callback', function () {
          let collection;
          // - Create a request callback that reads in the generated ``test_user1`` token file.
          const requestCallback = async () => {
            const file = readFile(`${process.env.OIDC_TOKEN_DIR}/test_user1`, { encoding: 'utf8' });
            console.log(JSON.parse(file));
            return { accessToken: '' };
          };
          // - Create a client with a url of the form
          // ``mongodb://test_user1@localhost:27018/?authMechanism=MONGODB-OIDC&directConnection=true&readPreference=secondaryPreferred``
          // and the OIDC request callback.
          before(function () {
            const client = new MongoClient(
              'mongodb://test_user1@localhost:27018/?authMechanism=MONGODB-OIDC&directConnection=true&readPreference=secondaryPreferred',
              {
                authMechanismProperties: {
                  REQUEST_TOKEN_CALLBACK: requestCallback
                }
              }
            );
            collection = client.db('testOidc').collection('test');
          });

          // - Perform a ``find`` operation.
          // - Clear the cache.
          it('successfully authenticates', async function () {
            const doc = await collection.findOne();
            expect(doc).to.equal(null);
          });
        });

        context('when using aws', function () {
          const testTokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
          let collection;

          after(() => {
            process.env.AWS_WEB_IDENTITY_TOKEN_FILE = testTokenFile;
          });

          before(async () => {
            // - Set the ``AWS_WEB_IDENTITY_TOKEN_FILE`` environment variable to the location
            // of the ``test_user1`` generated token file.
            process.env.AWS_WEB_IDENTITY_TOKEN_FILE = `${process.env.OIDC_TOKEN_DIR}/test_user1`;
            // - Create a client with a url of the form
            // ``mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&authMechanismProperties=DEVICE_NAME:aws&directConnection=true&readPreference=secondaryPreferred``.
            const client = new MongoClient(
              'mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&authMechanismProperties=DEVICE_NAME:aws&directConnection=true&readPreference=secondaryPreferred'
            );
            collection = client.db('testOidc').collection('test');
          });

          // - Perform a ``find`` operation.
          it('successfully authenticates', async function () {
            const doc = await collection.findOne();
            expect(doc).to.equal(null);
          });
        });
      });

      context('when authenticating with user 2', function () {
        context('when using a callback', function () {
          let collection;
          // - Create a request callback that reads in the generated ``test_user2`` token file.
          const requestCallback = async () => {
            const file = readFile(`${process.env.OIDC_TOKEN_DIR}/test_user2`, { encoding: 'utf8' });
            console.log(JSON.parse(file));
            return { accessToken: '' };
          };
          // - Create a client with a url of the form
          // ``mongodb://test_user2@localhost:27018/?authMechanism=MONGODB-OIDC&directConnection=true&readPreference=secondaryPreferred``
          // and the OIDC request callback.
          before(function () {
            const client = new MongoClient(
              'mongodb://test_user2@localhost:27018/?authMechanism=MONGODB-OIDC&directConnection=true&readPreference=secondaryPreferred',
              {
                authMechanismProperties: {
                  REQUEST_TOKEN_CALLBACK: requestCallback
                }
              }
            );
            collection = client.db('testOidc').collection('test');
          });

          // - Perform a ``find`` operation.
          // - Clear the cache.
          it('successfully authenticates', async function () {
            const doc = await collection.findOne();
            expect(doc).to.equal(null);
          });
        });

        context('when using aws', function () {
          let collection;
          const testTokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;

          after(() => {
            process.env.AWS_WEB_IDENTITY_TOKEN_FILE = testTokenFile;
          });

          before(async () => {
            // - Set the ``AWS_WEB_IDENTITY_TOKEN_FILE`` environment variable to the location
            // of the ``test_user2`` generated token file.
            process.env.AWS_WEB_IDENTITY_TOKEN_FILE = `${process.env.OIDC_TOKEN_DIR}/test_user2`;
            // - Create a client with a url of the form
            // ``mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&authMechanismProperties=DEVICE_NAME:aws&directConnection=true&readPreference=secondaryPreferred``.
            const client = new MongoClient(
              'mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&authMechanismProperties=DEVICE_NAME:aws&directConnection=true&readPreference=secondaryPreferred'
            );
            collection = client.db('testOidc').collection('test');
          });

          // - Perform a ``find`` operation.
          it('successfully authenticates', async function () {
            const doc = await collection.findOne();
            expect(doc).to.equal(null);
          });
        });
      });

      context('when not providing a user', function () {
        let collection;
        // - Create a client with a url of the form
        // ``mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&directConnection=true&readPreference=secondaryPreferred``
        // and the OIDC request callback.
        before(function () {
          const client = new MongoClient(
            'mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&directConnection=true&readPreference=secondaryPreferred'
          );
          collection = client.db('testOidc').collection('test');
        });

        // - Assert that a ``find`` operation fails.
        it('fails to authenticate', async function () {
          expect(async () => {
            await collection.findOne();
          }).to.throw;
        });
      });
    });

    describe('4. Invalid Callbacks', function () {
      // - Any callback returns null
      context('when the callback returns null', function () {
        let client;
        const requestCallback = async () => {
          return null;
        };

        before(function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: requestCallback
            }
          });
        });

        it('raises an error', async function () {
          expect(async () => {
            await client.connect();
          }).to.throw;
        });
      });

      // - Any callback returns unexpected result
      context('then the callback returns an unexpected result', function () {
        let client;
        const requestCallback = async () => {
          return { unexpected: 'test' };
        };

        before(function () {
          client = new MongoClient('mongodb://localhost/?authMechanism=MONGODB-OIDC', {
            authMechanismProperties: {
              REQUEST_TOKEN_CALLBACK: requestCallback
            }
          });
        });

        it('raises an error', async function () {
          expect(async () => {
            await client.connect();
          }).to.throw;
        });
      });
    });

    // Drivers MUST ensure that they are testing the ability to cache credentials.
    // Drivers will need to be able to query and override the cached credentials to
    // verify usage.  Unless otherwise specified, the tests MUST be performed with
    // the authorization code workflow with and without a provided refresh callback.
    // If desired, the caching tests can be done using mock server responses.
    describe('5. Caching', function () {
      // - Clear the cache.
      // - Create a new client with a request callback and a refresh callback.  Both callbacks will read the contents of the ``AWS_WEB_IDENTITY_TOKEN_FILE`` location to obtain a valid access token.
      // - Validate the request callback inputs, including the timeout parameter if
      // -ssible.
      // - Give a callback response with a valid accessToken and an expiresInSeconds
      // -at is within one minute.
      // - Ensure that a ``find`` operation adds credentials to the cache.
      // - Create a new client with the same request callback and a refresh callback.
      // - Ensure that a ``find`` operation results in a call to the refresh callback.
      // - Validate the refresh callback inputs, including the timeout parameter if
      // -ssible.
      // - Ensure there is a cache with credentials that will expire in less than 5 minutes, using a client with an appropriate request callback.
      // - Create a new client with the a request callback but no refresh callback.
      // - Ensure that a ``find`` operation results in a call to the request callback.
      // - the driver does not supports using callback hashes as part of the cache key,
      // -ip the next test.
      // -Create a new client with a different request callback.
      // -Ensure that a ``find`` operation adds a new entry to the cache.
      // - Clear the cache.
      // - Ensure there is a cache with credentials that will expire in less than 5 minutes, using a client with an appropriate request callback.
      // - Ensure there is a cache with credentials that will expire in less than 5 minutes.
      // - Create a new client with a valid request callback and a refresh callback that gives invalid credentials.
      // - Ensure that a ``find`` operation results in an error.
      // - Ensure that the cache has been cleared.
      // - Clear the cache.
      // - Create a new client using the AWS device workflow.
      // - Ensure that a ``find`` operation does not add credentials to the cache.
    });
  });
});
