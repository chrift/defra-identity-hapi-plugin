const debug = require('debug')('defra.identity:methods:dynamics:webApi:create')
const got = require('got')

module.exports = (
  {
    server,
    cache,
    config,
    internals
  }) => {
  debug('Registering dynamics create methods...')

  const {
    buildHeaders,
    buildUrl,
    decodeResponse
  } = internals.dynamics

  /**
   * deleteEnrolment
   * The API call returns no response status 204 with an empty body
   * @param {string} token The Dynamics Azure Active Directory token
   * @param {string} lobServiceUserLinkId The Dynamics ID of the enrolment
   * @returns {Promise<Object>}
   */
  const deactivateEnrolment = async (lobServiceUserLinkId) => {
    const headers = await buildHeaders()
    const url = buildUrl(`/defra_lobserviceuserlinks(${lobServiceUserLinkId})/Microsoft.Dynamics.CRM.defra_deleteenrolment`) // typo in documentation the url is defra_lobserviceuserlinks not userlink as it shows in sharepoint
    return got({
      method: 'POST',
      url,
      headers
    }).then(decodeResponse)
  }

  return {
    deactivateEnrolment
  }
}
