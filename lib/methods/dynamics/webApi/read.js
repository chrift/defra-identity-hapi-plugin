const debug = require('debug')('defra.identity:methods:dynamics:webApi')
const _ = require('lodash')
const got = require('got')

const models = require('../../../models')

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
    buildHeaders,
    buildUrl,
    parseOptionalInteger,
    mappings
  } = internals.dynamics

  /**
   * Break a query into an array of smaller queries
   * @param {Object} query generally in like { accountIds: [nnn] }
   * @param {String} fieldName the name of the field containing the ids
   * @returns {Array} an array of queries like [ {accountIds:[ ]}, {accountIds:[ ]} ]
   */
  const chunkQuery = (query, fieldName) => {
    const splitIds = _.chunk(query[fieldName], 100) // TODO: how many ids can a GET filter querystring handle?
    return splitIds.map(ids => {
      const result = { ...query }
      result[fieldName] = ids
      return result
    })
  }

  /**
   * Queries dynamics for contacts matching the passed parameters
   *
   * @param {Object<{email: string|null, b2cObjectId: string|null}>} query
   * @return {Promise<{sub: *, dynamicsContactId: (string|string), firstName: (*|string), lastName: (*|string), email: (string), telephoneNumber: (string), mobileNumber: (string), termsAcceptedVersion: *, termsAcceptedOn}[]>}
   */
  const readContacts = async function (query) {
    const request = await readContacts.buildRequest(query)

    const res = await got(request)

    return readContacts.parseResponse(res)
  }

  readContacts.buildRequest = async function (query) {
    const headers = await buildHeaders()
    const params = {}

    if (query.email) {
      // If plain string, then do a match
      if (typeof query.email === 'string') {
        params.$filter = `emailaddress1 eq '${query.email}'`
      } else if (typeof query.email === 'object') {
        // A more complex query using e.g. endswith
        const { type, value } = query.email
        if (type === 'endswith') {
          params.$filter = `endswith(emailaddress1,'${value}')`
        }
      } else {
        throw Error('Unrecognised parameter used for email when reading an organisation')
      }
    } else if (query.b2cObjectId) {
      params.$filter = `defra_b2cobjectid eq '${query.b2cObjectId}'`
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
        termsAcceptedOn: new Date(d.defra_tacsacceptedon) // date is in ISO8601 form
      }
    })

    return databuckets
  }

  /**
   * Fetches all citizen links of the passed contact
   *
   * @param {string} contactId
   * @param {string|Array|undefined} [accountIds]
   * @param {string|Array|undefined} [roleIds]
   * @return {Promise<Array>}
   */
  const readContactsAccountLinks = async (contactId, accountIds = undefined, roleIds = undefined) => {
    const splitQueries = accountIds ? chunkQuery({ accountIds }, 'accountIds') : [{ accountIds: undefined }]

    const requests = splitQueries.map(async splitQuery => {
      const request = await readContactsAccountLinks.buildRequest(contactId, splitQuery.accountIds, roleIds)
      const contactLinks = await got(request)
      return readContactsAccountLinks.parseResponse(contactLinks)
    })

    let results = await Promise.all(requests)
    results = results.reduce((a, b) => a.concat(b), []) // flatten the array or arrays into a single array

    return results
  }

  readContactsAccountLinks.buildRequest = async (contactId, accountIds, roleIds) => {
    const params = {
      $filter: `_record1id_value eq ${contactId}`
    }

    if (roleIds) {
      roleIds = [].concat(roleIds)
    } else {
      roleIds = [
        mappings.roleId.citizen,
        mappings.roleId.employee,
        mappings.roleId.agentCustomer
      ]
    }

    params.$filter += ` and ( ${roleIds.map(roleId => `_record1roleid_value eq ${roleId}`).join(' or ')} ) `

    if (accountIds) {
      accountIds = [].concat(accountIds)

      params.$filter += ` and ( ${accountIds.map(accountId => `_record2id_value eq ${accountId}`).join(' or ')} ) `
    }

    const url = buildUrl('/connections', params)
    const headers = await buildHeaders()

    return {
      method: 'GET',
      url,
      headers
    }
  }

  readContactsAccountLinks.parseResponse = (res) => {
    const data = decodeResponse(res)

    if (!Array.isArray(data.value)) {
      throw new Error('readContactsAccountLinks response has unrecognised JSON')
    }

    if (!data || !data.value) {
      return
    }

    const links = data.value.map(link => {
      return {
        connectionId: link.connectionid,
        connectionDetailsId: link._defra_connectiondetailsid_value,
        accountId: link._record2id_value,
        roleId: link._record1roleid_value
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

    return got(request).then(decodeResponse)
  }

  /**
   * Build request object for /defra_lobserivceroles API endpoint
   * @param  {Array<String>|String}  serviceId A service ID or array of service IDs
   * @return {Promise}               A Promise to call the endpoint
   */
  readServiceRoles.buildRequest = async (serviceId) => {
    const params = {}
    const paramParts = [].concat(serviceId)

    params.$filter = paramParts.map(x => `_defra_lobservice_value eq ${x}`).join(' or ')

    const headers = await buildHeaders()
    const url = buildUrl('/defra_lobserivceroles', params)

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
   * @param {Array|String} [serviceRoleIds]
   * @param {Array|String} [accountIds]
   * @param {Array|String} [serviceUserLinkIds]
   * @param {Array|String} [serviceIds]
   * @param {Boolean} [includeAllServiceRecords=false]
   * @return {Promise<Object{value: Array<Object>}>}
   */
  const readEnrolment = async (contactIds, serviceRoleIds = undefined, accountIds = undefined, serviceUserLinkIds = undefined, serviceIds = undefined, includeAllServiceRecords = false) => {
    const splitQueries = accountIds ? chunkQuery({ accountIds }, 'accountIds') : [{ accountIds: undefined }]

    const requests = splitQueries.map(async splitQuery => {
      const request = await readEnrolment.buildRequest(contactIds, serviceRoleIds, splitQuery.accountIds, serviceUserLinkIds, serviceIds, includeAllServiceRecords)
      return got(request).then(decodeResponse)
    })

    const results = await Promise.all(requests)
    const flatResults = results.reduce((a, b) => a.concat(b.value), []) // flatten the array or arrays into a single array

    return {
      value: flatResults
    }
  }

  readEnrolment.buildRequest = async (contactIds, serviceRoleIds = undefined, accountIds = undefined, serviceUserLinkIds = undefined, serviceIds = undefined, includeAllServiceRecords = false) => {
    contactIds = [].concat(contactIds).filter(i => !!i)
    accountIds = [].concat(accountIds).filter(i => !!i)
    serviceUserLinkIds = [].concat(serviceUserLinkIds).filter(i => !!i)
    serviceRoleIds = [].concat(serviceRoleIds).filter(i => !!i)
    serviceIds = [].concat(serviceIds).filter(i => !!i)

    const filterArr = [
      `( ${contactIds.map(id => `_defra_serviceuser_value eq ${id}`).join(' or ')} )`,
      `statuscode eq ${mappings.serviceUserLinkStatusCode.active}`
    ]

    if (accountIds.length) {
      filterArr.push(`( ${accountIds.map(id => `_defra_organisation_value eq ${id}`).join(' or ')} )`)
    }

    if (serviceUserLinkIds.length) {
      filterArr.push(`( ${serviceUserLinkIds.map(id => `defra_lobserviceuserlinkid eq ${id}`).join(' or ')} )`)
    }

    const serviceRelatedFilters = []

    if (serviceRoleIds.length) {
      serviceRelatedFilters.push(`( ${serviceRoleIds.map(id => `_defra_servicerole_value eq ${id}`).join(' or ')} )`)
    }

    if (serviceIds.length) {
      serviceRelatedFilters.push(`( ${serviceIds.map(id => `_defra_service_value eq ${id}`).join(' or ')} )`)
    }

    if (includeAllServiceRecords && serviceRelatedFilters.length) {
      filterArr.push('(' + serviceRelatedFilters.join('or') + ')')
    }

    const params = {
      $filter: filterArr.join(' and '),
      $expand: 'defra_ServiceRole'
    }

    const headers = await buildHeaders()
    const url = buildUrl('/defra_lobserviceuserlinks', params)

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
   * @param {Boolean} [includeHandshakeRoles=false]
   * @return {Promise<{roles: Array, mappings: Array}>}
   */
  const readServiceEnrolment = async (serviceId, contactId, includeHandshakeRoles = false) => {
    const serviceRoles = await readServiceRoles(serviceId)

    // In order to get all service enrolments we need to specify the service id and the service roles
    // handshake roles have the service id but not a service role
    // service roles do not have the service id
    const enrolment = await readEnrolment(contactId, serviceRoles.value.map(role => role.defra_lobserivceroleid), null, null, serviceId, true)

    return readServiceEnrolment.parseResponse(enrolment, includeHandshakeRoles)
  }

  readServiceEnrolment.parseResponse = (enrolments, includeHandshakeRoles = false) => {
    const response = {
      roles: [],
      mappings: []
    }

    const mappingObjects = {
      roles: {},
      mappings: {}
    }

    if (enrolments && Array.isArray(enrolments.value)) {
      _.each(enrolments.value, enrolment => {
        if (!includeHandshakeRoles && enrolment.defra_ishandshake) {
          return
        }

        const orgId = enrolment._defra_organisation_value || ''
        const orgName = enrolment['_defra_organisation_value@OData.Community.Display.V1.FormattedValue'] || ''

        const serviceRoleId = enrolment._defra_servicerole_value || ''
        const serviceRoleName = enrolment['_defra_servicerole_value@OData.Community.Display.V1.FormattedValue'] || ''

        const enrolmentStatusId = enrolment.defra_enrolmentstatus
        const enrolmentStatusName = enrolment['defra_enrolmentstatus@OData.Community.Display.V1.FormattedValue']

        const fullRoleString = `${orgId}:${serviceRoleId}:${enrolmentStatusId}`

        // Get our roles and mappings into objects - simple way of deduping in case the user has multiple roles with the same account/service/enrolmentStatusId
        mappingObjects.roles[fullRoleString] = fullRoleString

        // No org id if personal account
        if (orgId) {
          mappingObjects.mappings[orgId] = `${orgId}:${orgName}`
        }

        mappingObjects.mappings[serviceRoleId] = `${serviceRoleId}:${serviceRoleName}`
        mappingObjects.mappings[enrolmentStatusId] = `${enrolmentStatusId}:${enrolmentStatusName}`
      })

      response.roles = Object.values(mappingObjects.roles)
      response.mappings = Object.values(mappingObjects.mappings)
    }

    return response
  }

  /**
   *
   * @param {String} serviceId
   * @param {String} contactId
   * @param {Boolean} onlyUnspent
   * @return {Promise<[models.EnrolmentRequest]>}
   */
  const readEnrolmentRequests = async (serviceId, contactId, onlyUnspent = true) => {
    const request = await readEnrolmentRequests.buildRequest(serviceId, contactId, onlyUnspent)

    const response = await got(request)

    return readEnrolmentRequests.parseResponse(response)
  }

  readEnrolmentRequests.buildRequest = async (serviceId, contactId, onlyUnspent) => {
    const filter = [
      `_defra_service_value eq ${serviceId}`,
      `_defra_serviceuser_value eq ${contactId}`
    ]

    if (onlyUnspent) {
      filter.push('statuscode eq 1')
    }

    const params = {
      $filter: filter.join(' and ')
    }

    const headers = await buildHeaders()
    const url = buildUrl('/defra_lobserviceuserlinkrequests', params)

    return {
      method: 'GET',
      url,
      headers
    }
  }

  readEnrolmentRequests.parseResponse = (response) => {
    const data = decodeResponse(response)

    if (!Array.isArray(data.value)) {
      throw new Error('readEnrolmentRequests response has unrecognised JSON')
    }

    if (!data || !data.value) {
      return []
    }

    return data.value.map(enrolmentRequest => models.EnrolmentRequest.fromPlainObject({
      enrolmentRequestId: enrolmentRequest.defra_lobserviceuserlinkrequestid,
      serviceId: enrolmentRequest._defra_service_value,
      accountId: enrolmentRequest._defra_organisation_value,
      contactId: enrolmentRequest._defra_serviceuser_value,
      connectionDetailsId: enrolmentRequest._defra_connectiondetail_value,
      status: enrolmentRequest.statuscode,
      state: enrolmentRequest.statecode
    }))
  }

  /**
   * Fetches all accounts for the given accountIds
   *
   * @param {Array} accountIds An array of accountIds
   * @param {Object} server
   * @return {Promise<Account[]>} An array of Accounts defined by the input array of Ids
   */
  const readAccounts = async (accountIds = []) => {
    const splitQueries = chunkQuery({ accountIds }, 'accountIds')
    const requests = splitQueries.map(async splitQuery => {
      const request = await readAccounts.buildRequest(splitQuery.accountIds)
      const accounts = await got(request)
      return readAccounts.parseResponse(accounts)
    })

    const results = await Promise.all(requests)
    return results.reduce((a, b) => a.concat(b), []) // flatten the array or arrays into a single array
  }

  readAccounts.buildRequest = async (accountIds) => {
    const params = {
      $filter: ''
    }

    if (accountIds.length) {
      params.$filter += ` ( ${accountIds.map(accountId => `accountid eq ${accountId}`).join(' or ')} ) `
    }

    const url = buildUrl('/accounts', params)
    const headers = await buildHeaders()

    return {
      method: 'GET',
      url,
      headers
    }
  }

  readAccounts.parseResponse = (response) => {
    const data = decodeResponse(response)

    if (!Array.isArray(data.value)) {
      throw new Error('readAccounts response has unrecognised JSON')
    }

    if (!data) {
      return
    }

    const links = data.value.map(link => {
      return {
        accountId: link.accountid,
        accountName: link.name
      }
    })

    return links
  }

  return {
    readAccounts,
    readContacts,
    readContactsAccountLinks,
    readServiceRoles,
    readEnrolment,
    readServiceEnrolment,
    readEnrolmentRequests
  }
}
