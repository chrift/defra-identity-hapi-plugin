const config = require('../config')

module.exports = [
  {
    method: 'GET',
    path: '/enrolment',
    options: {
      auth: 'idm'
    },
    handler: async function (request, h) {
      const { idm } = request.server.methods

      const claims = await idm.getClaims(request)

      const services = await idm.dynamics.readServices()
      const serviceRoles = await idm.dynamics.readServiceRoles()
      const serviceEnrolments = await idm.dynamics.readServiceEnrolment(null, claims.contactId)

      const parsedAuthzRoles = idm.dynamics.parseAuthzRoles(serviceEnrolments)

      parsedAuthzRoles.flat.forEach(enrolment => {
        const {
          _defra_lobservice_value: serviceId,
          '_defra_lobservice_value@OData.Community.Display.V1.FormattedValue': serviceName
        } = serviceRoles.value.find(serviceRole => serviceRole.defra_lobserivceroleid === enrolment.roleId)

        enrolment.serviceId = serviceId
        enrolment.serviceName = serviceName
      })

      const serviceRolesByService = {}

      serviceRoles.value.forEach(role => {
        const serviceRoleArr = serviceRolesByService[role._defra_lobservice_value] = serviceRolesByService[role._defra_lobservice_value] || []

        serviceRoleArr.push({

        })
      })

      return h.view('enrolment', {
        services,
        idm,
        claims,
        parsedAuthzRoles,
        credentials: await idm.getCredentials(request)
      })
    }
  },
  {
    method: 'POST',
    path: '/enrolment',
    options: {
      auth: 'idm'
    },
    handler: async function (request, h) {
      const { idm } = request.server.methods
      const { enrolmentStatusId } = request.payload
      const mappings = idm.dynamics.getMappings()
      const claims = await idm.getClaims(request)
      let parsedAuthzRoles = idm.dynamics.parseAuthzRoles(claims)

      const newEnrolmentStatusId = Number(enrolmentStatusId)
      const { contactId } = claims

      // Get the accounts this contact has with the type of employer
      const contactEmployerLinks = await idm.dynamics.readContactsEmployerLinks(contactId)

      // If this contact has no links to any employers, then stop. There is a problem
      if (!contactEmployerLinks) {
        throw new Error(`Contact record not linked to any accounts - contactId ${contactId}`)
      }

      const { serviceRoleId } = config

      try {
        if (!parsedAuthzRoles) {
          // Create

          let initialEnrolmentStatus

          // If we want a complete status, we have to set it as incomplete or pending first
          switch (newEnrolmentStatusId) {
            case mappings.enrolmentStatus.incomplete:
            case mappings.enrolmentStatus.pending:
              initialEnrolmentStatus = newEnrolmentStatusId
              break
            case mappings.enrolmentStatus.completeApproved:
            case mappings.enrolmentStatus.completeRejected:
              initialEnrolmentStatus = mappings.enrolmentStatus.incomplete
              break
          }

          const createEnrolmentPromiseArr = contactEmployerLinks.map(link => idm.dynamics.createEnrolment(serviceRoleId, contactId, link.accountId, link.connectionDetailsId, initialEnrolmentStatus, mappings.enrolmentType.other))

          await Promise.all(createEnrolmentPromiseArr)

          // Refresh our token with new roles
          await idm.refreshToken(request)

          // Refresh our parsedAuthzRoles so our next stage can use them
          const claims = await idm.getClaims(request)

          parsedAuthzRoles = idm.dynamics.parseAuthzRoles(claims)
        }

        const completeEnrolmentStatuses = [mappings.enrolmentStatus.completeApproved, mappings.enrolmentStatus.completeRejected]

        // Update
        // If we already had roles - so didn't need to create
        // or we didn't have roles but our new status should be complete
        if (parsedAuthzRoles || completeEnrolmentStatuses.indexOf(newEnrolmentStatusId) !== -1) {
          // Need lobServiceUserLinkIds from current enrolments to update enrolments
          // Get all the ids of the roles with which we have an existing enrolment
          const existingRoleIds = parsedAuthzRoles.flat.map(role => role.roleId)

          // Get all our org ids with which we have a pending enrolment
          const existingRoleOrgIds = parsedAuthzRoles.flat.map(role => role.orgId)

          // Get details of our existing enrolments matching the above role ids and org ids
          const currentEnrolments = await idm.dynamics.readEnrolment(contactId, existingRoleIds, existingRoleOrgIds)

          // Create an array of our enrolment
          const updateEnrolmentPromiseArr = currentEnrolments.value
            .map(currentEnrolment => idm.dynamics.updateEnrolmentStatus(currentEnrolment.defra_lobserviceuserlinkid, newEnrolmentStatusId))

          await Promise.all(updateEnrolmentPromiseArr)
        }

        // Refresh our token with new roles
        await idm.refreshToken(request)

        return 'Enrolment successfully updated. <a href="/enrolment">Click here to return</a>'
      } catch (e) {
        console.error(e)

        return `Uh oh. Error: ${e.message}`
      }
    }
  }
]
