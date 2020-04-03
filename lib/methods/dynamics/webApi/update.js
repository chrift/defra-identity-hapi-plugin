const debug = require('debug')('defra.identity:methods:dynamics:webApi:update')
const got = require('got')

module.exports = (
  {
    server,
    cache,
    config,
    internals
  }) => {
  debug('Registering dynamics update methods...')

  const {
    decodeResponse,
    buildHeaders,
    buildUrl
  } = internals.dynamics

  /**
   * Updates an existing enrolment to the passed enrolment status
   *
   * @param {string} lobServiceUserLinkId
   * @param {Number} newEnrolmentStatus
   * @return {Promise<Object>}
   */
  const updateEnrolmentStatus = async (lobServiceUserLinkId, newEnrolmentStatus) => {
    const request = await updateEnrolmentStatus.buildRequest(lobServiceUserLinkId, newEnrolmentStatus)

    return got(request).then(decodeResponse)
  }

  updateEnrolmentStatus.buildRequest = async (lobServiceUserLinkId, newEnrolmentStatus) => {
    const payload = {
      UpdateEnrolmentStatus: newEnrolmentStatus
    }

    const headers = await buildHeaders()
    const url = buildUrl(`/defra_lobserviceuserlinks(${lobServiceUserLinkId})/Microsoft.Dynamics.CRM.defra_updateenrolment`)

    return {
      method: 'POST',
      url,
      headers,
      json: payload
    }
  }

  return {
    updateEnrolmentStatus
  }
}
