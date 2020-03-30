const qs = require('querystring')

module.exports = {
  redirectTo: (loginOnDisallow, disallowedRedirectPath, server) => (request) => {
    const { path } = request

    let redirectTo

    if (loginOnDisallow) {
      redirectTo = server.methods.idm.generateAuthenticationUrl(path)
    } else {
      redirectTo = disallowedRedirectPath

      redirectTo += '?' + qs.stringify({
        notLoggedInErr: 'yes'
      })
    }

    return redirectTo
  },
  validateFunc: (server) => async (request) => {
    // Retrieve from session store
    const credentials = await server.methods.idm.getCredentials(request)

    return {
      valid: credentials && !credentials.isExpired(),
      credentials
    }
  }
}
