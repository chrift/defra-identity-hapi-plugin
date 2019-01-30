const path = require('path')

require('dotenv').config({ path: path.join(__dirname, '..', '..', 'demo', '.env') })

const Lab = require('lab')
const Code = require('code')
const lab = exports.lab = Lab.script()

const { describe, it } = lab
const { expect } = Code

const Server = require('../server')

describe('Dynamics', () => {
  let server
  let idm

  // Get instance of server before each test
  lab.before(async () => {
    server = await Server()

    idm = server.methods.idm
  })

  it('should return an object of mappings for interaction with dynamics', () => {
    const mappings = idm.dynamics.getMappings()

    expect(mappings).to.be.an.object()
  })

  it('should return a token string', async () => {
    const token = await idm.dynamics.getToken()

    expect(token).to.be.a.string()
  })

  it('should parse authz api response correctly', async () => {
    const { enrolmentStatus } = idm.dynamics.getMappings()

    const managerEnrolmentId = '86ef4140-1fa6-e811-a954-000d3a39c2c8'
    const managerEnrolmentName = 'manager-enrolment-name'
    const userEnrolmentId = '86ef4140-1fa6-e811-a954-000d3a39c2c7'
    const userEnrolmentName = 'user-enrolment-name'
    const orgId = '86ef4140-1fa6-e811-a954-000d3a39c2c9'
    const orgName = '123'
    const gpg45 = '1'
    const gpg46 = '2'
    const managerRoleId = 'bfe1c82a-e09b-e811-a94f-000d3a3a8543'
    const managerRoleName = 'LE Manager'
    const userRoleId = 'dea3a347-e09b-e811-a94f-000d3a3a8543'
    const userRoleName = 'LE User'
    const pendingStatus = enrolmentStatus.pending
    const pendingStatusName = 'Pending'
    const completeApprovedStatus = enrolmentStatus.completeApproved
    const completeApprovedStatusName = 'Complete'

    const jwtClaims = {
      exp: 1537200994,
      nbf: 1537197394,
      ver: '1.0',
      iss: 'https://login.microsoftonline.com/xxx/v2.0/',
      sub: 'xxx',
      aud: 'xxx',
      acr: 'b2c_1a_scp_signup_signin_roles_dynx',
      iat: 1537197394,
      auth_time: 1537197394,
      email: 'email@email.com',
      roles: [
        [managerEnrolmentId, orgId, gpg45, gpg46, managerRoleId, pendingStatus].join(':'),
        [userEnrolmentId, orgId, gpg45, gpg46, userRoleId, completeApprovedStatus].join(':')
      ],
      roleMappings: [
        `${managerEnrolmentId}:${managerEnrolmentName}`,
        `${userEnrolmentId}:${userEnrolmentName}`,
        `${orgId}:${orgName}`,
        `${managerRoleId}:${managerRoleName}`,
        `${pendingStatus}:${pendingStatusName}`,
        `${userRoleId}:${userRoleName}`,
        `${completeApprovedStatus}:${completeApprovedStatusName}`
      ]
    }

    const parsedResponse = idm.dynamics.parseAuthzRoles(jwtClaims)

    const expectedParsedResponse = {
      rolesByOrg: {
        [orgId]: {
          organisation: {
            id: orgId,
            name: orgName
          },
          roles: {
            [managerRoleId]: {
              id: managerRoleId,
              name: managerRoleName,
              gpg45,
              gpg46,
              enrolment: {
                id: managerEnrolmentId,
                name: managerEnrolmentName
              },
              status: {
                id: pendingStatus,
                name: pendingStatusName
              }
            },
            [userRoleId]: {
              id: userRoleId,
              name: userRoleName,
              gpg45,
              gpg46,
              enrolment: {
                id: userEnrolmentId,
                name: userEnrolmentName
              },
              status: {
                id: completeApprovedStatus,
                name: completeApprovedStatusName
              }
            }
          }
        }
      },
      rolesByStatus: {
        [pendingStatus]: {
          [orgId]: {
            organisation: {
              id: orgId,
              name: orgName
            },
            roles: {
              [managerRoleId]: {
                id: managerRoleId,
                name: managerRoleName,
                gpg45,
                gpg46,
                enrolment: {
                  id: managerEnrolmentId,
                  name: managerEnrolmentName
                },
                status: {
                  id: pendingStatus,
                  name: pendingStatusName
                }
              }
            }
          }
        },
        [completeApprovedStatus]: {
          [orgId]: {
            organisation: {
              id: orgId,
              name: orgName
            },
            roles: {
              [userRoleId]: {
                id: userRoleId,
                name: userRoleName,
                gpg45,
                gpg46,
                enrolment: {
                  id: userEnrolmentId,
                  name: userEnrolmentName
                },
                status: {
                  id: completeApprovedStatus,
                  name: completeApprovedStatusName
                }
              }
            }
          }
        }
      },
      rolesByRole: {
        [managerRoleId]: {
          [orgId]: {
            id: managerRoleId,
            name: managerRoleName,
            gpg45,
            gpg46,
            enrolment: {
              id: managerEnrolmentId,
              name: managerEnrolmentName
            },
            status: {
              id: pendingStatus,
              name: pendingStatusName
            }
          }
        },
        [userRoleId]: {
          [orgId]: {
            id: userRoleId,
            name: userRoleName,
            gpg45,
            gpg46,
            enrolment: {
              id: userEnrolmentId,
              name: userEnrolmentName
            },
            status: {
              id: completeApprovedStatus,
              name: completeApprovedStatusName
            }
          }
        }
      },
      flat: [
        {
          enrolmentId: managerEnrolmentId,
          enrolmentName: managerEnrolmentName,
          gpg45,
          gpg46,
          roleId: managerRoleId,
          roleName: managerRoleName,
          orgId: orgId,
          orgName: orgName,
          orgRoleStatusIdNumber: pendingStatus,
          orgRoleStatusName: pendingStatusName
        },
        {
          enrolmentId: userEnrolmentId,
          enrolmentName: userEnrolmentName,
          gpg45,
          gpg46,
          roleId: userRoleId,
          roleName: userRoleName,
          orgId: orgId,
          orgName: orgName,
          orgRoleStatusIdNumber: completeApprovedStatus,
          orgRoleStatusName: completeApprovedStatusName
        }
      ]
    }

    expect(parsedResponse).to.equal(expectedParsedResponse)
  })
})
