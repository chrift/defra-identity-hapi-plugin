const enrolmentStatus = {
  incomplete: 1,
  pending: 2,
  completeApproved: 3,
  completeRejected: 4
}

const serviceUserLinkStatusCode = {
  active: 1,
  inactive: 2
}

const roleId = {
  employee: '1eb54ab1-58b7-4d14-bf39-4f3e402616e8',
  employer: '35a23b91-ec62-41ea-b5e5-c59b689ff0b4',
  agent: 'caaf4df7-0229-e811-a831-000d3a2b29f8',
  agentCustomer: '776e1b5a-1268-e811-a83b-000d3ab4f7af',
  citizen: '3fc7e717-0b90-e811-a845-000d3ab4fddf'
}

module.exports = {
  enrolmentStatus,
  serviceUserLinkStatusCode,
  roleId
}
