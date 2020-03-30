const Lab = require('@hapi/lab')
const Code = require('@hapi/code')
const lab = exports.lab = Lab.script()
const td = require('testdouble')

const { describe, it, beforeEach, afterEach } = lab
const { expect } = Code

const mockOptions = require('../mockOptions')

describe('Index', () => {
  let mock
  let passed
  let plugin

  afterEach(td.reset)

  beforeEach(() => {
    mock = {
      internals: {
        client: {
          getClient: (options) => {
            passed.getClient.options = options
          }
        },
        root: {
          redirectTo: (loginOnDisallow, disallowedRedirectPath, server) => {
            passed.redirectTo.loginOnDisallow = loginOnDisallow
            passed.redirectTo.disallowedRedirectPath = disallowedRedirectPath
            passed.redirectTo.server = server
          },
          validateFunc: (server) => {
            passed.validateFunc.server = server
          }
        }
      },
      cache: {
        get: async (key, request) => {
          passed.cacheGet.key = key
          passed.cacheGet.request = request
        },
        set: async (key, value, ttl, request) => {
          passed.cacheSet.key = key
          passed.cacheSet.value = value
          passed.cacheSet.ttl = ttl
          passed.cacheSet.request = request
        },
        drop: async (key, request) => {
          passed.cacheDrop.key = key
          passed.cacheDrop.request = request
        }
      },
      server: {
        cache: (options) => {
          passed.serverCache.options = options

          return mock.cache
        },
        register: (authCookiePlugin) => {
          passed.serverRegister.authCookiePlugin = authCookiePlugin
        },
        auth: {
          strategy: (name, scheme, options) => {
            passed.serverAuthStrategy.name = name
            passed.serverAuthStrategy.scheme = scheme
            passed.serverAuthStrategy.options = options
          },
          default: (name) => {
            passed.serverAuthDefault.name = name
          }
        }
      },
      options: mockOptions,
      modules: {
        routes: (options) => {
          passed.routes.options = options
        },
        methods: (options) => {
          passed.methods.options = options
        },
        internals: (options) => {
          passed.internals.options = options

          return mock.internals
        },
        config: {
          createConfig: (options) => {
            passed.createConfig.options = options

            return options
          },
          createCache: (passRequestToCacheMethods, specifiedCache) => {
            passed.createCache.passRequestToCacheMethods = passRequestToCacheMethods
            passed.createCache.specifiedCache = specifiedCache

            return specifiedCache
          }
        }
      }
    }

    passed = {
      createConfig: {
        options: null
      },
      createCache: {
        passRequestToCacheMethods: null,
        specifiedCache: null
      },
      serverCache: {
        options: null
      },
      Internals: {
        options: null
      },
      getClient: {
        options: null
      },
      internals: {
        options: null
      },
      methods: {
        options: null
      },
      serverRegister: {
        authCookiePlugin: null
      },
      serverAuthStrategy: {
        name: null,
        scheme: null,
        options: null
      },
      serverAuthDefault: {
        name: null
      },
      routes: {
        options: null
      },
      cacheGet: {
        key: null,
        request: null
      },
      cacheSet: {
        key: null,
        value: null,
        ttl: null,
        request: null
      },
      cacheDrop: {
        key: null,
        request: null
      },
      redirectTo: {
        loginOnDisallow: null,
        disallowedRedirectPath: null,
        server: null
      },
      validateFunc: {
        server: null
      }
    }

    td.replace('../../lib/routes', mock.modules.routes)
    td.replace('../../lib/methods', mock.modules.methods)
    td.replace('../../lib/internals', mock.modules.internals)
    td.replace('../../lib/config', mock.modules.config)

    plugin = require('../../lib/index')
  })

  beforeEach(async () => {
    await plugin.register(mock.server, mock.options)
  })

  it('should create config options', () => expect(passed.createConfig.options).to.equal(mock.options))
  it('should create a cache object', () => expect(passed.createCache).to.equal({
    passRequestToCacheMethods: mock.options.passRequestToCacheMethods,
    specifiedCache: mock.cache
  }))
  it('should register the plugin internal methods', () => expect(passed.internals.options).to.equal({
    server: mock.server,
    cache: mock.cache,
    config: mock.options
  }))
  it('should get the oidc client', () => expect(passed.getClient.options).to.equal({
    policyName: mock.options.defaultPolicy
  }))
  it('should register the plugin\'s server methods', () => expect(passed.methods.options).to.equal({
    server: mock.server,
    cache: mock.cache,
    config: mock.options,
    internals: mock.internals
  }))
  it('should register the idm auth strategy', () => {
    expect(passed.serverAuthStrategy.name).to.equal('idm')
    expect(passed.serverAuthStrategy.scheme).to.equal('cookie')
    expect(passed.serverAuthStrategy.options.cookie).to.equal({
      name: mock.options.cookieName,
      password: mock.options.cookiePassword,
      ttl: mock.options.cacheCookieTtlMs,
      isSecure: mock.options.isSecure,
      isSameSite: 'Lax',
      path: '/'
    })
    expect(passed.serverAuthStrategy.options.appendNext).to.be.true()
    expect(passed.redirectTo).to.equal({
      loginOnDisallow: mock.options.loginOnDisallow,
      disallowedRedirectPath: mock.options.disallowedRedirectPath,
      server: mock.server
    })
    expect(passed.validateFunc.server).to.equal(mock.server)
  })
  it('should register the routes', () => expect(passed.routes.options).to.equal({
    server: mock.server,
    cache: mock.cache,
    config: mock.options,
    internals: mock.internals
  }))

  describe('If the auth scheme should be on by default', () => {
    it('should set the default auth scheme', () => expect(passed.serverAuthDefault.name).to.equal('idm'))
  })

  describe('When a cache is not provided in config', () => {
    it('should use an in memory cache', () => expect(passed.serverCache.options).to.equal({
      segment: mock.options.cacheSegment,
      expiresIn: mock.options.cacheCookieTtlMs
    }))
  })
})
