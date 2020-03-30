const Lab = require('@hapi/lab')
const Code = require('@hapi/code')
const lab = exports.lab = Lab.script()

const { describe, it, beforeEach } = lab
const { expect } = Code

const mockOptions = require('../../mockOptions')
const config = require('../../../lib/config')

describe('Config', () => {
  describe('createConfig', () => {
    let outcome
    let errorMessage

    describe('when passed valid options', () => {
      beforeEach(() => {
        outcome = config.createConfig(mockOptions)
      })

      it('should return a config object furnished with extra items', () =>
        expect(outcome).to.equal({
          ...mockOptions,
          callbacks: {},
          redirectUriFqdn: mockOptions.appDomain + '/' + mockOptions.redirectUri
        })
      )
    })

    describe('when passed invalid options', () => {
      beforeEach(() => {
        outcome = undefined
        errorMessage = undefined

        try {
          outcome = config.createConfig({
            ...mockOptions,
            identityAppUrl: undefined
          })
        } catch (e) {
          errorMessage = e
        }
      })

      it('should throw an error', () => expect(errorMessage).to.be.an.error())
      it('should return undefined', () => expect(outcome).to.be.undefined())
    })
  })

  describe('createCache', () => {
    let specifiedCache
    let passed
    let mock

    beforeEach(() => {
      mock = {
        getResponse: Symbol('get response'),
        setResponse: Symbol('set response'),
        dropResponse: Symbol('drop response'),
        key: Symbol('key'),
        request: Symbol('request'),
        ttl: Symbol('ttl'),
        value: Symbol('value')
      }

      passed = {
        get: {
          key: null,
          request: null
        },
        set: {
          key: null,
          value: null,
          ttl: null,
          request: null
        },
        drop: {
          key: null,
          request: null
        }
      }

      specifiedCache = {
        get: (key, request) => {
          passed.get.key = key
          passed.get.request = request
        },
        set: (key, value, ttl, request) => {
          passed.set.key = key
          passed.set.value = value
          passed.set.ttl = ttl
          passed.set.request = request
        },
        drop: (key, request) => {
          passed.drop.key = key
          passed.drop.request = request
        }
      }
    })

    describe('when it should pass the request to the cache methods', () => {
      let createdCache

      beforeEach(() => {
        createdCache = config.createCache(true, specifiedCache)
      })

      it('should return an object containing a get method', () => {
        expect(createdCache.get).to.be.a.function()
        expect(createdCache.get.length).to.equal(2)
      })
      it('should return an object containing a set method', () => {
        expect(createdCache.set).to.be.a.function()
        expect(createdCache.set.length).to.equal(4)
      })
      it('should return an object containing a drop method', () => {
        expect(createdCache.drop).to.be.a.function()
        expect(createdCache.drop.length).to.equal(2)
      })

      describe('when the get method is called', () => {
        beforeEach(() => {
          createdCache.get(mock.key, mock.request)
        })

        it('should pass the key and request to the cache get method', () => expect(passed.get).to.equal({
          key: mock.key,
          request: mock.request
        }))
      })

      describe('when the set method is called', () => {
        beforeEach(() => {
          createdCache.set(mock.key, mock.value, mock.ttl, mock.request)
        })

        it('should pass the key, value, ttl and request to the cache set method', () => expect(passed.set).to.equal({
          key: mock.key,
          value: mock.value,
          ttl: mock.ttl,
          request: mock.request
        }))
      })

      describe('when the drop method is called', () => {
        beforeEach(() => {
          createdCache.drop(mock.key, mock.request)
        })

        it('should pass the key and request to the cache drop method', () => expect(passed.drop).to.equal({
          key: mock.key,
          request: mock.request
        }))
      })
    })

    describe('when it should not pass the request to the cache methods', () => {
      let createdCache

      beforeEach(() => {
        createdCache = config.createCache(false, specifiedCache)
      })

      it('should return an object containing a get method', () => {
        expect(createdCache.get).to.be.a.function()
        expect(createdCache.get.length).to.equal(2)
      })
      it('should return an object containing a set method', () => {
        expect(createdCache.set).to.be.a.function()
        expect(createdCache.set.length).to.equal(4)
      })
      it('should return an object containing a drop method', () => {
        expect(createdCache.drop).to.be.a.function()
        expect(createdCache.drop.length).to.equal(2)
      })

      describe('when the get method is called', () => {
        beforeEach(() => {
          createdCache.get(mock.key, mock.request)
        })

        it('should pass the key to the cache get method', () => expect(passed.get).to.equal({
          key: mock.key,
          request: undefined
        }))
      })

      describe('when the set method is called', () => {
        beforeEach(() => {
          createdCache.set(mock.key, mock.value, mock.ttl, mock.request)
        })

        it('should pass the key, value and ttl to the cache set method', () => expect(passed.set).to.equal({
          key: mock.key,
          value: mock.value,
          ttl: mock.ttl,
          request: undefined
        }))
      })

      describe('when the drop method is called', () => {
        beforeEach(() => {
          createdCache.drop(mock.key, mock.request)
        })

        it('should pass the key to the cache drop method', () => expect(passed.drop).to.equal({
          key: mock.key,
          request: undefined
        }))
      })
    })
  })
})
