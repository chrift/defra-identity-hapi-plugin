const Lab = require('@hapi/lab')
const Code = require('@hapi/code')
const uuid = require('uuid/v4')
const lab = exports.lab = Lab.script()

const { describe, it, beforeEach } = lab
const { expect } = Code

describe('Dynamics - create', () => {
  let mock
  let passed
  let dynamicsDelete
  let outcome

  beforeEach(() => {
    passed = {
      buildUrl: {
        path: null
      },
      buildHeaders: {
        headers: null
      },
      requestPromise: {
        options: null
      }
    }

    mock = {
      lobServiceUserLinkId: uuid(),
      decodedResponse: Symbol('decoded response'),
      builtHeaders: Symbol('built headers'),
      builtUrl: Symbol('built url'),
      internals: {
        dynamics: {
          requestPromise: async (options) => {
            passed.requestPromise.options = options
          },
          buildHeaders: async (headers) => {
            passed.buildHeaders.headers = headers

            return mock.builtHeaders
          },
          buildUrl: (path) => {
            passed.buildUrl.path = path

            return mock.builtUrl
          },
          decodeResponse: () => mock.decodedResponse
        }
      }
    }

    const Delete = require('../../../../../lib/methods/dynamics/webApi/delete')

    dynamicsDelete = Delete({ internals: mock.internals })
  })

  describe('deactiveEnrolment', () => {
    beforeEach(async () => {
      outcome = await dynamicsDelete.deactivateEnrolment(mock.lobServiceUserLinkId)
    })

    it('should build headers', () => expect(passed.buildHeaders.headers).to.equal(undefined))
    it('should built url', () => expect(passed.buildUrl.path).to.equal(`/defra_lobserviceuserlinks(${mock.lobServiceUserLinkId})/Microsoft.Dynamics.CRM.defra_deleteenrolment`))
    it('should make the request', () => expect(passed.requestPromise.options).to.equal({
      method: 'POST',
      url: mock.builtUrl,
      headers: mock.builtHeaders
    }))
    it('should return the decoded response', () => expect(outcome).to.equal(mock.decodedResponse))
  })
})
