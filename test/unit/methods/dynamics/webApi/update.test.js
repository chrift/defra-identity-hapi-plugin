const Lab = require('@hapi/lab')
const Code = require('@hapi/code')
const lab = exports.lab = Lab.script()

const { describe, it, beforeEach } = lab
const { expect } = Code

describe('Dynamics - update', async () => {
  let mock
  let passed
  let update

  beforeEach(() => {
    passed = {
      buildUrl: {
        path: null
      },
      buildHeaders: {
        headers: null
      }
    }

    mock = {
      builtUrl: Symbol('built url'),
      builtHeaders: Symbol('built headers'),
      internals: {
        dynamics: {
          requestPromise: async (options) => {
            passed.requestPromise.options = options
          },
          buildHeaders: async (headers) => {
            passed.buildHeaders.headers = headers

            return mock.builtHeaders
          },
          buildUrl: (path, params) => {
            passed.buildUrl.path = path
            passed.buildUrl.params = params

            return mock.builtUrl
          },
          decodeResponse: response => response
        }
      }
    }

    const Update = require('../../../../../lib/methods/dynamics/webApi/update')

    update = Update({ internals: mock.internals })
  })

  describe('Update enrolment', () => {
    it('should build correct request using required parameters', async () => {
      const request = await update.updateEnrolmentStatus.buildRequest('a20e6efe-9954-4c5b-a76c-83a5518a1385', 123)

      const expectedRequestObj = {
        method: 'POST',
        url: mock.builtUrl,
        headers: mock.builtHeaders,
        body: {
          UpdateEnrolmentStatus: 123
        },
        json: true
      }

      expect(request).to.equal(expectedRequestObj)
      expect(passed.buildUrl.path).to.equal('/defra_lobserviceuserlinks(a20e6efe-9954-4c5b-a76c-83a5518a1385)/Microsoft.Dynamics.CRM.defra_updateenrolment')
    })
  })
})
