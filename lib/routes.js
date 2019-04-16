const to = require('await-to-js').default
const debug = require('debug')('defra.identity:routes')
const fs = require('fs')
const path = require('path')
const qs = require('querystring')
const md5 = require('md5')

const postAuthenticationJsFile = fs.readFileSync(path.join(__dirname, 'static', 'postAuthenticationRedirect.js')).toString()

module.exports = (
  {
    server,
    cache,
    config,
    internals
  }) => {
  debug('Registering routes...')

  server.route({
    method: 'GET',
    path: config.outboundPath,
    config: {
      auth: false
    },
    handler: async (request, h) => {
      try {
        const { query } = request

        // We might have had a state or nonce manually passed through in our url
        const { state, nonce, scope } = query

        const outboundUrl = await server.methods.idm.generateOutboundRedirectUrl(request, request.query, { state, nonce, scope })

        return h.redirect(outboundUrl)
      } catch (e) {
        debug({ e })

        return config.callbacks.onError(e, request, h)
      }
    }
  })

  server.route({
    method: ['GET', 'POST'],
    path: config.redirectUri,
    config: {
      auth: false
    },
    handler: async (request, h) => {
      try {
        debug(`Received user at ${config.redirectUri}`)

        const { payload, method, query } = request

        // If we have a post request but we need to pass our request object to our caching methods, redirect back to this url
        // so we can make sure we have the correct cookie headers for this site
        // Cross domain post seems to not always include correct cookie headers
        if (method === 'post' && config.passRequestToCacheMethods) {
          return h.redirect(`${config.redirectUri}?${qs.stringify(payload)}`)
        }

        const requestParams = method === 'get' ? query : payload

        debug({ requestParams })

        /** Get our saved state **/
        const { state } = requestParams

        const [savedStateErr, savedState] = await to(cache.get(md5(state), request))

        debug({ savedState })

        if (!savedState || savedStateErr) {
          const savedStateErrObj = savedStateErr || {}
          const savedStateObj = savedState || {}

          if (!savedStateErr && !savedState) {
            savedStateErrObj.message = 'No saved state found'
          }

          return internals.routes.handleAuthorisationError(request, h, savedStateObj, savedStateErrObj)
        }

        const { policyName, nonce } = savedState

        const client = await internals.client.getClient({ policyName })

        debug({ client })

        const authRedirectUriFqdn = config.authRedirectUriFqdn || config.redirectUriFqdn

        debug({ authRedirectUriFqdn })

        /** Exchange code for token and validate token **/
        debug('About to fetch token')
        const [authorizationErr, tokenSet] = await to(client.authorizationCallback(authRedirectUriFqdn, requestParams, { state, nonce }))
        debug('Finished fetching token')

        /** Handle authorisation error **/
        if (authorizationErr) {
          debug({ authorizationErr })

          return internals.routes.handleAuthorisationError(request, h, savedState, authorizationErr)
        }

        return internals.routes.handleValidatedToken(request, h, state, savedState, tokenSet)
      } catch (e) {
        debug({ e })

        return config.callbacks.onError(e, request, h)
      }
    }
  })

  if (config.logoutPath) {
    server.route({
      method: 'GET',
      path: config.logoutPath,
      config: {
        auth: false
      },
      handler: async (request, h) => {
        try {
          if (config.callbacks.preLogout) {
            // Execute the callback passed into this plugin before continuing
            const preLogoutOutcome = await config.callbacks.preLogout(request, h)

            // If callback returned anything other than undefined return this instead of redirecting
            if (preLogoutOutcome !== undefined) {
              return preLogoutOutcome
            }
          }

          await server.methods.idm.logout(request)

          const {
            backToPath
          } = request.query

          const redirectUrl = internals.routes.fullyQualifiedLocalPath(backToPath)

          return h.redirect(redirectUrl)
        } catch (e) {
          debug({ e })

          return config.callbacks.onError(e, request, h)
        }
      }
    })
  }

  server.route({
    method: 'GET',
    path: config.postAuthenticationRedirectJsPath,
    config: {
      auth: false
    },
    // Alternatively, we could use h.file - but relies on the consuming service using the inert module
    handler: (request, h) => h.response(postAuthenticationJsFile).type('application/javascript')
  })

  debug('Done registering routes')
}
