const authCookie = require('@hapi/cookie')
const debug = require('debug')('defra.identity:index')

const { version } = require('../package')
const routes = require('./routes')
const methods = require('./methods')
const Internals = require('./internals')
const { createConfig, createCache } = require('./config')

module.exports = {
  name: 'idm',
  version,
  register: async function (server, options) {
    debug('Auth plugin register called')

    const config = createConfig(options)

    const {
      cacheSegment,
      cacheCookieTtlMs,
      cookiePassword,
      cookieName,
      disallowedRedirectPath,
      loginOnDisallow,
      isSecure,
      onByDefault,
      defaultPolicy,
      passRequestToCacheMethods
    } = config

    // Initialise cache
    let specifiedCache

    if (options.cache) {
      debug('Cache object passed in, using that for our cache')

      specifiedCache = options.cache
    } else {
      debug('No cache object specified, using in memory cache with segment %s', cacheSegment)

      specifiedCache = server.cache({
        segment: cacheSegment,
        expiresIn: cacheCookieTtlMs
      })
    }

    const cache = createCache(passRequestToCacheMethods, specifiedCache)

    // Register internal methods
    const internals = Internals({
      server,
      cache,
      config
    })

    if (defaultPolicy) {
      await internals.client.getClient({ policyName: defaultPolicy })
    }

    // Register server methods
    methods({
      server,
      cache,
      config,
      internals
    })

    debug('Registering @hapi/cookie...')

    // Register cookie plugin
    await server.register(authCookie)

    server.auth.strategy('idm', 'cookie', {
      cookie: {
        name: cookieName,
        password: cookiePassword,
        ttl: cacheCookieTtlMs,
        isSecure,
        isSameSite: 'Lax',
        path: '/'
      },
      appendNext: true,
      redirectTo: internals.root.redirectTo(loginOnDisallow, disallowedRedirectPath, server),
      validateFunc: internals.root.validateFunc(server)
    })

    debug('Done registering @hapi/cookie')

    if (onByDefault) {
      debug('onByDefault is true - setting default auth method')

      server.auth.default('idm')
    } else {
      debug('onByDefault is false - not setting default auth method')
    }

    // Register routes
    routes({
      server,
      cache,
      config,
      internals
    })

    debug('Auth plugin successfully registered')
  }
}
