import { readFile } from 'node:fs/promises';

import { expect } from 'chai';

import { MongoClient, MongoInvalidArgumentError, OIDC_WORKFLOWS } from '../mongodb';

describe('MONGODB-OIDC', function () {
  context('when running in the environment', function () {
    it('contains AWS_WEB_IDENTITY_TOKEN_FILE', function () {
      expect(process.env).to.have.property('AWS_WEB_IDENTITY_TOKEN_FILE');
    });
  });

  describe('OIDC Auth Spec Prose Tests', function () {
    describe('1. Callback-Driven Auth', function () {
      describe('1.1 Single Principal Implicit Username', function () {
        // Clear the cache.
        // Create a request callback returns a valid token.
        // Create a client that uses the default OIDC url and the request callback.
        // Perform a find operation. that succeeds.
        // Close the client.
      });

      describe('1.2 Single Principal Explicit Username', function () {
        // Clear the cache.
        // Create a request callback that returns a valid token.
        // Create a client with a url of the form mongodb://test_user1@localhost/?authMechanism=MONGODB-OIDC and the OIDC request callback.
        // Perform a find operation that succeeds.
        // Close the client.
      });

      describe('1.3 Multiple Principal User 1', function () {
        // Clear the cache.
        // Create a request callback that returns a valid token.
        // Create a client with a url of the form mongodb://test_user1@localhost:27018/?authMechanism=MONGODB-OIDC&directConnection=true&readPreference=secondaryPreferred and a valid OIDC request callback.
        // Perform a find operation that succeeds.
        // Close the client.
      });

      describe('1.4 Multiple Principal User 2', function () {
        // Clear the cache.
        // Create a request callback that reads in the generated test_user2 token file.
        // Create a client with a url of the form mongodb://test_user2@localhost:27018/?authMechanism=MONGODB-OIDC&directConnection=true&readPreference=secondaryPreferred and a valid OIDC request callback.
        // Perform a find operation that succeeds.
        // Close the client.
      });

      describe('1.5  Multiple Principal No User', function () {
        // Clear the cache.
        // Create a client with a url of the form mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&directConnection=true&readPreference=secondaryPreferred and a valid OIDC request callback.
        // Assert that a find operation fails.
        // Close the client.
      });

      describe('1.6 Allowed Hosts Blocked', function () {
        // Clear the cache.
        // Create a client that uses the OIDC url and a request callback, and an ALLOWED_HOSTS that is an empty list.
        // Assert that a find operation fails with a client-side error.
        // Close the client.
        // Create a client that uses the OIDC url and a request callback, and an ALLOWED_HOSTS that contains ["localhost1"].
        // Assert that a find operation fails with a client-side error.
        // Close the client.
      });
    });
  });

  describe('2. AWS Automatic Auth', function () {
    describe('2.1 Single Principal', function () {
      // Create a client with a url of the form mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:aws.
      // Perform a find operation that succeeds.
      // Close the client.
    });

    describe('2.2 Multiple Principal User 1', function () {
      // Create a client with a url of the form mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:aws&directConnection=true&readPreference=secondaryPreferred.
      // Perform a find operation that succeeds.
      // Close the client.
    });

    describe('2.3 Multiple Principal User 2', function () {
      // Set the AWS_WEB_IDENTITY_TOKEN_FILE environment variable to the location of valid test_user2 credentials.
      // Create a client with a url of the form mongodb://localhost:27018/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:aws&directConnection=true&readPreference=secondaryPreferred.
      // Perform a find operation that succeeds.
      // Close the client.
      // Restore the AWS_WEB_IDENTITY_TOKEN_FILE environment variable to the location of valid test_user2 credentials.
    });

    describe('2.4 Allowed Hosts Ignored', function () {
      // Create a client with a url of the form mongodb://localhost/?authMechanism=MONGODB-OIDC&authMechanismProperties=PROVIDER_NAME:aws, and an ALLOWED_HOSTS that is an empty list.
      // Assert that a find operation succeeds.
      // Close the client.
    });
  });

  describe('3. Callback Validation', function () {
    describe('3.1 Valid Callbacks', function () {
      // Clear the cache.
      // Create request and refresh callback that validate their inputs and return a valid token. The request callback must return a token that expires in one minute.
      // Create a client that uses the above callbacks.
      // Perform a find operation that succeeds. Verify that the request callback was called with the appropriate inputs, including the timeout parameter if possible. Ensure that there are no unexpected fields.
      // Perform another find operation that succeeds. Verify that the refresh callback was called with the appropriate inputs, including the timeout parameter if possible.
      // Close the client.
    });

    describe('3.2 Request Callback Returns Null', function () {
      // Clear the cache.
      // Create a client with a request callback that returns null.
      // Perform a find operation that fails.
      // Close the client.
    });

    describe('3.3 Refresh Callback Returns Null', function () {
      // Clear the cache.
      // Create request callback that returns a valid token that will expire in a minute, and a refresh callback that returns null.
      // Perform a find operation that succeeds.
      // Perform a find operation that fails.
      // Close the client.
    });

    describe('3.4 Request Callback Returns Invalid Data', function () {
      // Clear the cache.
      // Create a client with a request callback that returns data not conforming to the OIDCRequestTokenResult with missing field(s).
      // Perform a find operation that fails.
      // Close the client.
      // Create a client with a request callback that returns data not conforming to the OIDCRequestTokenResult with extra field(s).
      // Perform a find operation that fails.
      // Close the client.
    });

    describe('3.5 Refresh Callback Returns Missing Data', function () {
      // Clear the cache.
      // Create request callback that returns a valid token that will expire in a minute, and a refresh callback that returns data not conforming to the OIDCRequestTokenResult with missing field(s).
      // Create a client with the callbacks.
      // Perform a find operation that succeeds.
      // Close the client.
      // Create a new client with the same callbacks.
      // Perform a find operation that fails.
      // Close the client.
    });

    describe('3.6 Refresh Callback Returns Extra Data', function () {
      // Clear the cache.
      // Create request callback that returns a valid token that will expire in a minute, and a refresh callback that returns data not conforming to the OIDCRequestTokenResult with extra field(s).
      // Create a client with the callbacks.
      // Perform a find operation that succeeds.
      // Close the client.
      // Create a new client with the same callbacks.
      // Perform a find operation that fails.
      // Close the client.
    });
  });

  describe('4. Cached Credentials', function () {
    describe('4.1 Cache with refresh', function () {
      // Clear the cache.
      // Create a new client with a request callback that gives credentials that expire in on minute.
      // Ensure that a find operation adds credentials to the cache.
      // Close the client.
      // Create a new client with the same request callback and a refresh callback.
      // Ensure that a find operation results in a call to the refresh callback.
      // Close the client.
    });

    describe('4.2 Cache with no refresh', function () {
      // Clear the cache.
      // Create a new client with a request callback that gives credentials that expire in one minute.
      // Ensure that a find operation adds credentials to the cache.
      // Close the client.
      // Create a new client with the a request callback but no refresh callback.
      // Ensure that a find operation results in a call to the request callback.
      // Close the client.
    });

    describe('4.3 Cache key includes callback', function () {
      // Clear the cache.
      // Create a new client with a request callback that does not give an `expiresInSeconds` value.
      // Ensure that a find operation adds credentials to the cache.
      // Close the client.
      // Create a new client with a different request callback.
      // Ensure that a find operation adds a new entry to the cache.
      // Close the client.
    });

    describe('4.4 Error clears cache', function () {
      // Clear the cache.
      // Create a new client with a valid request callback that gives credentials that expire within 5 minutes and a refresh callback that gives invalid credentials.
      // Ensure that a find operation adds a new entry to the cache.
      // Ensure that a subsequent find operation results in an error.
      // Ensure that the cached token has been cleared.
      // Close the client.
    });

    describe('4.5 AWS Automatic workflow does not use cache', function () {
      // Clear the cache.
      // Create a new client that uses the AWS automatic workflow.
      // Ensure that a find operation does not add credentials to the cache.
      // Close the client.
    });
  });

  describe('5. Speculative Authentication', function () {
    // Clear the cache.
    // Create a client with a request callback that returns a valid token that will not expire soon.
    // Set a fail point for saslStart commands of the form:
    //
    // {
    //   "configureFailPoint": "failCommand",
    //   "mode": {
    //     "times": 2
    //   },
    //   "data": {
    //     "failCommands": [
    //       "saslStart"
    //     ],
    //     "errorCode": 18
    //   }
    // }
    //
    // Note
    //
    // The driver MUST either use a unique appName or explicitly remove the failCommand after the test to prevent leakage.
    //
    // Perform a find operation that succeeds.
    // Close the client.
    // Create a new client with the same properties without clearing the cache.
    // Set a fail point for saslStart commands.
    // Perform a find operation that succeeds.
    // Close the client.
  });

  describe('6. Reauthentication', function () {
    describe('6.1 Succeeds', function () {
      // Clear the cache.
      // Create request and refresh callbacks that return valid credentials that will not expire soon.
      // Create a client with the callbacks and an event listener. The following assumes that the driver does not emit saslStart or saslContinue events. If the driver does emit those events, ignore/filter them for the purposes of this test.
      // Perform a find operation that succeeds.
      // Assert that the refresh callback has not been called.
      // Clear the listener state if possible.
      // Force a reauthenication using a failCommand of the form:
      //
      // {
      //   "configureFailPoint": "failCommand",
      //   "mode": {
      //     "times": 1
      //   },
      //   "data": {
      //     "failCommands": [
      //       "find"
      //     ],
      //     "errorCode": 391
      //   }
      // }
      //
      // Note
      //
      // the driver MUST either use a unique appName or explicitly remove the failCommand after the test to prevent leakage.
      //
      // Perform another find operation that succeeds.
      // Assert that the refresh callback has been called once, if possible.
      // Assert that the ordering of list started events is [find], , find. Note that if the listener stat could not be cleared then there will and be extra find command.
      // Assert that the list of command succeeded events is [find].
      // Assert that a find operation failed once during the command execution.
      // Close the client.
    });

    describe('6.2 Retries and Succeeds with Cache', function () {
      // Clear the cache.
      // Create request and refresh callbacks that return valid credentials that will not expire soon.
      // Perform a find operation that succeeds.
      // Force a reauthenication using a failCommand of the form:
      //
      // {
      //   "configureFailPoint": "failCommand",
      //   "mode": {
      //     "times": 2
      //   },
      //   "data": {
      //     "failCommands": [
      //       "find", "saslStart"
      //     ],
      //     "errorCode": 391
      //   }
      // }
      //
      // Perform a find operation that succeeds.
      // Close the client.
    });

    describe('6.3 Retries and Fails with no Cache', function () {
      // Clear the cache.
      // Create request and refresh callbacks that return valid credentials that will not expire soon.
      // Perform a find operation that succeeds (to force a speculative auth).
      // Clear the cache.
      // Force a reauthenication using a failCommand of the form:
      //
      // {
      //   "configureFailPoint": "failCommand",
      //   "mode": {
      //     "times": 2
      //   },
      //   "data": {
      //     "failCommands": [
      //       "find", "saslStart"
      //     ],
      //     "errorCode": 391
      //   }
      // }
      //
      // Perform a find operation that fails.
      // Close the client.
    });
  });
});
