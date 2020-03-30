const Lab = require('@hapi/lab')
const Code = require('@hapi/code')
const uuid = require('uuid/v4')
const lab = exports.lab = Lab.script()

const { describe, it, beforeEach } = lab
const { expect } = Code
const rootMethods = require('../../../lib/internals/root')

describe('Root', () => {
  let mock
  let passed
  let outcome

  describe('redirectTo', () => {
    let redirectTo

    beforeEach(() => {
      passed = {
        generateAuthenticationUrl: {
          path: null
        }
      }

      mock = {
        authenticationUrl: uuid(),
        request: {
          path: uuid()
        },
        server: {
          methods: {
            idm: {
              generateAuthenticationUrl: (path) => {
                passed.generateAuthenticationUrl.path = path

                return mock.authenticationUrl
              }
            }
          }
        }
      }

      redirectTo = rootMethods.redirectTo(true, uuid(), mock.server)

      outcome = redirectTo(mock.request)
    })

    it('should be a function', () => expect(redirectTo).to.be.a.function())
    it('should expect 1 argument', () => expect(redirectTo.length).to.equal(1))

    it('should generate an authentication url', () => expect(passed.generateAuthenticationUrl.path).to.equal(mock.request.path))
    it('should return the authentication url', () => expect(outcome).to.equal(mock.authenticationUrl))
  })

  describe('validateFunc', () => {
    let validateFunc

    beforeEach(async () => {
      passed = {
        getCredentials: {
          request: null
        },
        isExpired: {
          called: null
        }
      }

      mock = {
        credentials: {
          isExpired: () => {
            passed.isExpired.called = true

            return false
          }
        },
        server: {
          methods: {
            idm: {
              getCredentials: (request) => {
                passed.getCredentials.request = request

                return mock.credentials
              }
            }
          }
        }
      }

      validateFunc = rootMethods.validateFunc(mock.server)

      outcome = await validateFunc(mock.request)
    })

    it('should be a function', () => expect(validateFunc).to.be.a.function())
    it('should expect 1 argument', () => expect(validateFunc.length).to.equal(1))

    it('should fetch the user\'s credentials', () => expect(passed.getCredentials.request).to.equal(mock.request))
    it('should check to see if the user\'s credentials have expired', () => expect(passed.isExpired.called).to.be.true())
    it('should return an object indicating whether the user is authenticated', () => expect(outcome).to.equal({
      valid: true,
      credentials: mock.credentials
    }))
  })
})
