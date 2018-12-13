const debug = require('debug')('defra.identity:methods:dynamics:webApi')

/**
 * Anonymous factory method to create and return methods to access Dynamics
 * @param  {Object} server     [description]
 * @param  {Object} cache      [description]
 * @param  {Object} config     [description]
 * @param  {Object} internals  [description]
 * @return {Object<Function>}  An object of functions
 */
module.exports = (
  {
    server,
    cache,
    config,
    internals
  }) => {
  debug('Registering dynamics read methods...')

  const {
    decodeResponse,
    requestPromise,
    buildHeaders,
    buildUrl,
    parseOptionalInteger,
    mappings
  } = internals.dynamics

  /**
   * Queries dynamics for contacts matching the passed parameters
   *
   * @param {Object<{email: string|null, b2cObjectId: string|null}>} query
   * @return {Promise<{sub: *, dynamicsContactId: (string|string), firstName: (*|string), lastName: (*|string), email: (string), telephoneNumber: (string), mobileNumber: (string), termsAcceptedVersion: *, termsAcceptedOn}[]>}
   */
  const readContacts = async function (query) {
    const request = await readContacts.buildRequest(query)

    const res = await requestPromise(request)

    return readContacts.parseResponse(res)
  }

  readContacts.buildRequest = async function (query) {
    const headers = await buildHeaders()
    const params = {}

    if (query.email) {
      // If plain string, then do a match
      if (typeof query.email === 'string') {
        params['$filter'] = `emailaddress1 eq '${query.email}'`
      } else if (typeof query.email === 'object') {
        // A more complex query using e.g. endswith
        const { type, value } = query.email
        if (type === 'endswith') {
          params['$filter'] = `endswith(emailaddress1,'${value}')`
        }
      } else {
        throw Error('Unrecognised parameter used for email when reading an organisation')
      }
    } else if (query.b2cObjectId) {
      params['$filter'] = `defra_b2cobjectid eq '${query.b2cObjectId}'`
    }

    return {
      method: 'GET',
      url: buildUrl('/contacts', params),
      headers
    }
  }

  readContacts.parseResponse = function (res) {
    let data = decodeResponse(res)
    data = Array.isArray(data.value) ? data.value : [data]
    // Put into databuckets
    const databuckets = data.map(d => {
      debug('readContact response')
      debug('%O', d)
      return {
        sub: d.defra_b2cobjectid,
        dynamicsContactId: d.contactid,
        firstName: d.firstname,
        lastName: d.lastname,
        email: d.emailaddress1,
        telephoneNumber: d.telephone1, // @fixme This may be the mobile number if this is the only number supplied
        mobileNumber: d.telephone1,
        termsAcceptedVersion: parseOptionalInteger(d.defra_tacsacceptedversion),
        termsAcceptedOn: mappings.dateTimeStringToDate(d.defra_tacsacceptedon)
      }
    })

    return databuckets
  }

  /**
   * Fetches a user's contact id from their b2cObjectId
   *
   * @param {string} b2cObjectId
   * @return {Promise<String>}
   */
  const readContactIdFromB2cObjectId = async (b2cObjectId) => {
    const contactRecords = await readContacts({
      b2cObjectId
    })

    if (contactRecords) {
      return contactRecords[0].dynamicsContactId
    } else {
      return null
    }
  }

  /**
   * Fetches all employers of the passed contact
   *
   * @param {string} contactId
   * @param {string} accountId
   * @return {Promise<Array>}
   */
  const readContactsEmployerLinks = async (contactId, accountId) => {
    const request = await readContactsEmployerLinks.buildRequest(contactId, accountId)

    const res = await requestPromise(request)

    return readContactsEmployerLinks.parseResponse(res, contactId)
  }

  readContactsEmployerLinks.buildRequest = async (contactId, accountId) => {
    const params = {
      '$filter': `_record1id_value eq ${contactId} and _record1roleid_value eq ${mappings.roleId.employee}`
    }

    if (accountId) {
      params.$filter += ` and _record2id_value eq ${accountId} and _record2roleid_value eq ${mappings.roleId.employer}`
    }

    const url = buildUrl('/connections', params)
    const headers = await buildHeaders()

    return {
      method: 'GET',
      url,
      headers
    }
  }

  readContactsEmployerLinks.parseResponse = (res, contactId) => {
    const data = decodeResponse(res)

    if (!Array.isArray(data.value)) {
      throw new Error('readContactsEmployerLinks response has unrecognised JSON')
    }

    if (!data || !data.value) {
      return
    }

    const links = data.value.map(link => {
      const accountId = link._record1id_value === contactId ? link._record2id_value : link._record1id_value

      return {
        connectionId: link.connectionid,
        connectionDetailsId: link._defra_connectiondetailsid_value,
        accountId
      }
    })

    return links
  }

  /**
   * Fetches all Agent Customers of the passed contact
   *
   * @param {string} contactId
   * @param {string} accountId
   * @return {Promise<Array>}
   */
  const readContactsAgentCustomerLinks = async (contactId, accountId) => {
    const request = await readContactsAgentCustomerLinks.buildRequest(contactId, accountId)

    const res = await requestPromise(request)

    return readContactsAgentCustomerLinks.parseResponse(res, contactId)
  }

  readContactsAgentCustomerLinks.buildRequest = async (contactId, accountId) => {
    const params = {
      '$filter': `_record1id_value eq ${contactId} and _record1roleid_value eq ${mappings.roleId.agentCustomer}`
    }

    if (accountId) {
      params.$filter += ` and _record2id_value eq ${accountId} and _record2roleid_value eq ${mappings.roleId.agent}`
    }

    const url = buildUrl('/connections', params)
    const headers = await buildHeaders()

    return {
      method: 'GET',
      url,
      headers
    }
  }

  readContactsAgentCustomerLinks.parseResponse = (res, contactId) => {
    const data = decodeResponse(res)

    if (!Array.isArray(data.value)) {
      throw new Error('readContactsAgentCustomerLinks response has unrecognised JSON')
    }

    if (!data || !data.value) {
      return
    }

    const links = data.value.map(link => {
      const accountId = link._record1id_value === contactId ? link._record2id_value : link._record1id_value

      return {
        connectionId: link.connectionid,
        connectionDetailsId: link._defra_connectiondetailsid_value,
        accountId
      }
    })

    return links
  }

  /**
   * Fetches all roles that can be assigned to a user for the passed servie
   *
   * @param {string} serviceId
   * @return {Promise<Object>}
   */
  const readServiceRoles = async (serviceId) => {
    const request = await readServiceRoles.buildRequest(serviceId)

    return requestPromise(request).then(decodeResponse)
  }

  /**
   * Build request object for /defra_lobserivceroles API endpoint
   * @param  {Array<String>|String}  serviceId A service ID or array of service IDs
   * @return {Promise}               A Promise to call the endpoint
   */
  readServiceRoles.buildRequest = async (serviceId) => {
    const params = {}
    const paramParts = [].concat(serviceId)

    if (serviceId) {
      params['$filter'] = paramParts.map(x => `_defra_lobservice_value eq ${x}`).join(' or ')
    }

    const headers = await buildHeaders()
    const url = buildUrl(`/defra_lobserivceroles`, params)

    return {
      method: 'GET',
      url,
      headers
    }
  }

  /**
   * Fetches all services
   *
   * @param {string|undefined} serviceId
   * @return {Promise<Object>}
   */
  const readServices = async (serviceId) => {
    const request = await readServices.buildRequest(serviceId)

    return requestPromise(request).then(decodeResponse)
  }

  /**
   * Build request object for /defra_lobservices API endpoint
   */
  readServices.buildRequest = async (serviceId) => {
    const params = {}

    if (serviceId) {
      params['$filter'] = serviceId
    }

    const headers = await buildHeaders()
    const url = buildUrl(`/defra_lobservices`, params)

    return {
      method: 'GET',
      url,
      headers
    }
  }

  /**
   * Fetches all enrolment records for the passed contact. Takes optional parameters for defining the roles and accountIds to filter by
   *
   * @param {Array|String} contactIds
   * @param {Array|null} serviceRoleIds
   * @param {Array|null} accountIds
   * @param {Array|null} serviceUserLinkIds
   * @return {Promise<Object>}
   */
  const readEnrolment = async (contactIds, serviceRoleIds = null, accountIds = null, serviceUserLinkIds = null) => {
    const request = await readEnrolment.buildRequest(contactIds, serviceRoleIds, accountIds, serviceUserLinkIds)

    return requestPromise(request).then(decodeResponse)
  }

  readEnrolment.buildRequest = async (contactIds, serviceRoleIds = null, accountIds = null, serviceUserLinkIds = null) => {
    if (typeof contactIds === 'string') {
      contactIds = [contactIds]
    }

    if (typeof serviceRoleIds === 'string') {
      serviceRoleIds = [serviceRoleIds]
    }

    if (typeof accountIds === 'string') {
      accountIds = [accountIds]
    }

    if (typeof serviceUserLinkIds === 'string') {
      serviceUserLinkIds = [serviceUserLinkIds]
    }

    const filterArr = [
      `( ${contactIds.map(id => `_defra_serviceuser_value eq ${id}`).join(' or ')} )`,
      `statuscode eq ${mappings.serviceUserLinkStatusCode.active}`
    ]

    if (serviceRoleIds) {
      filterArr.push(`( ${serviceRoleIds.map(id => `_defra_servicerole_value eq ${id}`).join(' or ')} )`)
    }

    if (accountIds) {
      filterArr.push(`( ${accountIds.map(id => `_defra_organisation_value eq ${id}`).join(' or ')} )`)
    }

    if (serviceUserLinkIds) {
      filterArr.push(`( ${serviceUserLinkIds.map(id => `defra_lobserviceuserlinkid eq ${id}`).join(' or ')} )`)
    }

    const params = {
      $filter: filterArr.join(' and '),
      $expand: 'defra_ServiceRole'
    }

    const headers = await buildHeaders()
    const url = buildUrl(`/defra_lobserviceuserlinks`, params)

    return {
      method: 'GET',
      url,
      headers
    }
  }

  /**
   *
   * @param {string} serviceId
   * @param {string} contactId
   * @return {Promise<{roles: Array, mappings: Array}>}
   */
  const readServiceEnrolment = async (serviceId, contactId) => {
    const serviceRoles = await readServiceRoles(serviceId)

    if (!serviceRoles || !Array.isArray(serviceRoles.value)) {
      return readServiceEnrolment.parseResponse(null)
    }

    const enrolment = await readEnrolment(contactId, serviceRoles.value.map(role => role.defra_lobserivceroleid))

    return readServiceEnrolment.parseResponse(enrolment)
  }

  readServiceEnrolment.parseResponse = (enrolment) => {
    const response = {
      roles: [],
      roleMappings: []
    }

    if (enrolment && Array.isArray(enrolment.value)) {
      enrolment.value.forEach(enrol => {
        response.roles.push(`${enrol._defra_organisation_value}:${enrol._defra_servicerole_value}:${enrol.defra_enrolmentstatus}`)

        response.roleMappings.push(`${enrol._defra_organisation_value}:${enrol['_defra_organisation_value@OData.Community.Display.V1.FormattedValue']}`)
        response.roleMappings.push(`${enrol._defra_servicerole_value}:${enrol['_defra_servicerole_value@OData.Community.Display.V1.FormattedValue']}`)
        response.roleMappings.push(`${enrol.defra_enrolmentstatus}:${enrol['defra_enrolmentstatus@OData.Community.Display.V1.FormattedValue']}`)
      })
    }

    return response
  }

  return {
    readContacts,
    readContactIdFromB2cObjectId,
    readContactsEmployerLinks,
    readContactsAgentCustomerLinks,
    readServiceRoles,
    readServices,
    readEnrolment,
    readServiceEnrolment
  }
}
