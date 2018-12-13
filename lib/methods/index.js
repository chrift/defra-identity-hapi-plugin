const Hoek = require('hoek')
const url = require('url')
const debug = require('debug')('defra.identity:methods')
const uuidv4 = require('uuid/v4')
const md5 = require('md5')

const registerDynamicsMethods = require('./dynamics')

module.exports = (
  {
    server,
    cache,
    config,
    internals
  }) => {
  debug('Registering server methods...')

  /**
   * Gets the user's session credentials - i.e. refresh token, expiry times of credentials
   *
   * @param {object} request - hapi request object
   * @returns {object|Boolean}
   */
  const getCredentials = async (request) => {
    Hoek.assert(typeof request === 'object', 'request object must be passed to idm.getCredentials')

    let cacheKey

    try {
      cacheKey = request.state[config.cookieName].sub
    } catch (e) {
      return false
    }

    if (!cacheKey) { return false }

    const cacheData = await cache.get(cacheKey, request)

    if (cacheData && typeof cacheData === 'object') {
      cacheData.isExpired = function () {
        const nowTimestamp = ((new Date()).getTime()) / 1000

        return !this.claims || (this.claims.exp < nowTimestamp)
      }
    }

    return cacheData
  }

  /**
   * Gets the user's claims
   *
   * @param {object} request - hapi request object
   * @returns {object|null}
   */
  const getClaims = async (request) => {
    Hoek.assert(typeof request === 'object', 'request object must be passed to idm.getClaims')

    const credentials = await getCredentials(request)

    if (credentials) { return credentials.claims }

    return null
  }

  /**
   * Gets a url to the plugin's outboundPath
   *
   * @param {string} backToPath - Where to send the user after they have logged in
   * @param {object} obj
   * @param {string} obj.policyName - The name of the policy the user should be sent to in B2C
   * @param {string} obj.journey - The name of the policy the user should be sent to in the identity app
   * @param {Boolean} obj.forceLogin - Whether the user should be forced to log in or not - ignores whether they are already logged in at the IdP
   * @param {Boolean} obj.returnUrlObject - Whether to return a url object. By default returns the url as a string
   * @param {string|undefined} obj.state - Manually specify the state string to use
   * @param {string|undefined} obj.nonce - Manually specify the nonce string to use
   */
  const generateAuthenticationUrl = (backToPath, { policyName, journey, forceLogin = false, returnUrlObject = false, state = undefined, nonce = undefined } = {}) => {
    backToPath = backToPath || config.defaultBackToPath

    const outboundUrl = url.parse(config.appDomain)

    outboundUrl.pathname = config.outboundPath

    outboundUrl.query = {
      backToPath,
      policyName,
      journey,
      forceLogin: forceLogin ? 'yes' : undefined,
      state,
      nonce
    }

    if (returnUrlObject) { return outboundUrl }

    return outboundUrl.format()
  }

  /**
   * Logs the user out
   *
   * @param {object} request - hapi request object
   */
  const logout = async (request) => {
    Hoek.assert(typeof request === 'object', 'request object must be passed to idm.logout')

    let cacheKey

    try {
      cacheKey = request.state[config.cookieName].sub
    } catch (e) {}

    if (cacheKey) {
      await cache.drop(cacheKey, request)
    }

    request.cookieAuth.clear()
  }

  /**
   * Refreshes the user's JWT
   *
   * @param {object} request - hapi request object
   * @param {String} contactId - manually specify user's contact id in case it wasn't present in the original token
   */
  const refreshToken = async (request, contactId = undefined) => {
    const creds = await getCredentials(request)
    const { claims } = creds

    const client = await internals.client.getClient({ policyName: claims.tfp || claims.acr })

    const refreshToken = creds.tokenSet.refresh_token

    const tokenSet = await client.refresh(refreshToken)

    // If we had no contact id specified, then use the ones from the original tokem
    contactId = contactId || tokenSet.claims.contactId

    // We still won't have a contact id if they haven't completed registration yet
    if (contactId) {
      const serviceRoles = await server.methods.idm.dynamics.readServiceEnrolment(config.serviceId, contactId)

      tokenSet.claims.roles = serviceRoles.roles
      tokenSet.claims.roleMappings = serviceRoles.roleMappings

      // If our original token didn't have a contact id then our refreshed one won't either - stick the contact id back in
      if (!tokenSet.claims.contactId) {
        tokenSet.claims.contactId = contactId
      }
    }

    // @todo handle failed/rejected refresh
    await internals.routes.storeTokenSetResponse(request, tokenSet)

    debug('refreshed and validated tokens %j', tokenSet)
    debug('refreshed id_token claims %j', tokenSet.claims)
  }

  /**
   *
   * @param {Object} request - Hapi request object
   * @param {Object} config
   * @param {string} config.backToPath - Where to send the user after they have logged in
   * @param {string} config.policyName - The name of the policy the user should be sent to in B2C
   * @param {string} config.journey - The name of the journey the user should be sent to in the identity app
   * @param {Boolean|String} config.forceLogin - Whether the user should be forced to log in or not - ignores whether they are already logged in at the IdP
   * @param {?Object} options
   * @param {string|null} options.state Manually specify state
   * @param {Object} options.stateCacheData Manually specify state cache data
   * @param {Object} options.redirectUri Manually specify redirect uri
   * @param {Object} options.clientId Manually specify client id
   * @param {Object} options.serviceId Manually specify consuming service id
   * @param {Object} options.nonce Manually specify nonce
   */
  const generateOutboundRedirectUrl = async (request, { backToPath, policyName, forceLogin, journey }, { state = null, stateCacheData = {}, redirectUri = undefined, clientId = undefined, serviceId = null, nonce = undefined } = {}) => {
    policyName = policyName || config.defaultPolicy
    journey = journey || config.defaultJourney
    state = state || uuidv4()
    redirectUri = redirectUri || config.redirectUriFqdn
    serviceId = serviceId || config.serviceId
    clientId = clientId || config.clientId

    if (forceLogin === 'yes') {
      forceLogin = true
    }

    nonce = nonce || undefined

    stateCacheData = Hoek.applyToDefaults({
      policyName,
      forceLogin,
      backToPath,
      journey,
      nonce
    }, stateCacheData)

    // If our state is massively long, it could cause an error in cosmos db- hash it so we know it will be short enough
    await cache.set(md5(state), stateCacheData, undefined, request)

    const client = await internals.client.getClient({ policyName })

    let authorizationUrl = client.authorizationUrl({
      redirect_uri: redirectUri,
      scope: 'openid offline_access',
      state,
      prompt: forceLogin ? 'login' : undefined,
      response_type: 'code',
      response_mode: 'form_post',
      client_id: clientId,
      policyName,
      journey,
      serviceId,
      nonce
    })

    return authorizationUrl
  }

  registerDynamicsMethods({ server, cache, config, internals })

  server.method('idm.getCredentials', getCredentials)
  server.method('idm.getClaims', getClaims)
  server.method('idm.generateAuthenticationUrl', generateAuthenticationUrl)
  server.method('idm.logout', logout)
  server.method('idm.refreshToken', refreshToken)
  server.method('idm.generateOutboundRedirectUrl', generateOutboundRedirectUrl)

  server.method('idm.getConfig', () => config)
  server.method('idm.getInternals', () => internals)
  server.method('idm.getCache', () => cache)

  debug('Done registering server methods')
}
