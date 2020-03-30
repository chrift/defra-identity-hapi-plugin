# Defra.Identity hapi plugin

See the [change log](changelog.md) for a complete list of deprecations and changes

**Note:** 
- Versions <5 are for use with Hapi 17
- Versions >= 5 are for use with Hapi 19

The Defra.Identity Hapi Plugin (DIHP) is designed to streamline and standardise the way Defra services interact with an OpenID Connect (OIDC) Identity Provider (IdP).

You can read more about OpenID Connect [here](https://connect2id.com/learn/openid-connect).

# Before you start

Before you use DIHP, there are a few things you will need. If you do not have the following items, please contact the identity team to begin the onboarding process.

For registration:
- Url of the Identity App you are connecting to
- Your Identity Service Id
- Your Identity Client Id
- Your Identity Client Secret
- The name of the journey you want to send your user on for authentication
- The name of the B2C policy your user will go through for authentication

For enrolment and fetching of user information:
- Url of the Active Directory authentication endpoint
- Tenant Id of the Active Directory instance you are connecting to
- Your Dynamics Client Id
- Your Dynamics Client Secret
- Url of the Dynamics instance you are connecting to

# Demo
You can find a demo implementation of this plugin in our [demo service](https://github.com/DEFRA/defra-identity-hapi-plugin-demo).

# Quick start
## Installation
This plugin is available from the [DEFRA npm organisation account](https://www.npmjs.com/org/envage):
```
npm install @envage/defra-identity-hapi-plugin --save
```

Generic docs about how to implement hapi auth plugins can be found [here](https://hapijs.com/tutorials/auth).

The full set of configuration options, and their defining schemas can be found in [lib/config/schema.js](lib/config/schema.js).

You can see what values are applied by default in [lib/config/defaults.js](lib/config/defaults.js).

Example implementation with required config values:

```
const {
    IDENTITY_APP_URL,
    IDENTITY_SERVICEID,
    IDENTITY_COOKIEPASSWORD,
    IDENTITY_CLIENTID,
    IDENTITY_CLIENTSECRET,
    IDENTITY_DEFAULT_POLICY,
    IDENTITY_DEFAULT_JOURNEY,
    AAD_AUTHHOST,
    AAD_TENANTNAME,
    DYNAMICS_AADCLIENTID,
    DYNAMICS_AADCLIENTSECRET,
    DYNAMICS_RESOURCEURL,
    DYNAMICS_ENDPOINTBASE
} = process.env

await server.register({
    plugin: require('@envage/defra-identity-hapi-plugin'),
    options: {
      appDomain: `http://${HOST}:${PORT}`, // This is the domain your application is exposed through. This is used to form part of the url the user will be redirected back to after authentication
      identityAppUrl: IDENTITY_APP_URL,
      serviceId: IDENTITY_SERVICEID,  
      cookiePassword: IDENTITY_COOKIEPASSWORD,
      clientId: IDENTITY_CLIENTID,
      clientSecret: IDENTITY_CLIENTSECRET,
      defaultPolicy: IDENTITY_DEFAULT_POLICY,
      defaultJourney: IDENTITY_DEFAULT_JOURNEY,
      isSecure: false, // Set this if without https - i.e. localhost,
      aad: {
        authHost: AAD_AUTHHOST,
        tenantName: AAD_TENANTNAME
      },
      dynamics: {
        clientId: DYNAMICS_AADCLIENTID,
        clientSecret: DYNAMICS_AADCLIENTSECRET,
        resourceUrl: DYNAMICS_RESOURCEURL,
        endpointBase: DYNAMICS_ENDPOINTBASE
      }
    }
  })
```

## Auth by default
By default, the `onByDefault` option is false. So in the example above, to secure a route with DIHP, you will need to enable auth for that specific route.

For example:

```
server.route({
    method: 'GET',
    path: '/',
    options: {
      auth: 'idm'
    },
    handler: async function (request, h) {
      return 'Hello world'
    }
})
```

You can enable auth for every route by passing `onByDefault` as true. If you do this, you will need to specify which routes you **don't** want auth enabled on.

For example:

```
server.route({
    method: 'GET',
    path: '/',
    options: {
      auth: false
    },
    handler: async function (request, h) {
      return 'Hello world'
    }
})
```

## Cache
By default, DIHP uses an in memory cache. This is useful for getting an implementation up and running quickly in development. In production you can pass a `cache` object to the config. This can be any type of cache implementation, as long as the object you pass in adheres to the following api:
```
{
 get: async (key, request = undefined) => {},
 set: async (key, value, ttl, request = undefined) => {}
 drop: async (key, request = undefined) => {}
}
```

This is the same interface as the built in [hapi cache](https://hapijs.com/tutorials/caching). An example implementation can be found in [`demo/server.js`](demo/server.js).

**Note:** If you need the request object to be passed into your caching methods, you need to set the config option `passRequestToCacheMethods` as true when registering the plugin. This may be useful if you want to use client side caching.

## Cookie
DIHP uses [hapi-auth-cookie](https://github.com/hapijs/hapi-auth-cookie) to manage its cookies. DIHP will use this to store an encrypted reference to the users claims, stored in the plugin's cache.

This reference does not include any user information, at no point does the plugin expose any user information to the client's browser.

You can specify the name of the cookie set on the user's browser by passing in `cookieName`.

You must also pass in `cookiePassword`. It is a required field, that must be at least 32 characters long. This password is used to encrypt the data in the cookie.

## Routes

The following routes are exposed by the plugin. All route paths are customisable when instantiating the plugin

1. Outbound path - default: /login/out
    - Calls `server.methods.idm.generateOutboundRedirectUrl` with parameters contained within the url and and redirects the user to the url returned
2. Return uri - default: /login/return
    - Handles the user upon return from an authentication request
3. Log out - default: /logout
    - Logs the user out and redirects them to a specified path

## Refreshing token
At present, the plugin exposes functionality to refresh the user's token, but it does not do it automatically. It is up to the service to decide when to check the validity of the claims and execute the refresh function

For example:

```
server.route({
    method: 'GET',
    path: '/',
    handler: async function (request, h) {
      // Fetch the user's credentials from the cache
      const creds = await server.methods.idm.getCredentials(request)

      // If the user has credentials and they are expired, call the refresh method
      if (creds && creds.isExpired()) {
        await server.methods.idm.refreshToken(request)
      }

      return 'Hello world'
    }
})
```

You could also tell hapi to check the user's token at specific point in the request lifecycle.

For example:

```
server.ext('onPreAuth', async (request, h) => {
  const { idm } = request.server.methods

  const creds = await idm.getCredentials(request)

  if (creds && creds.isExpired()) {
    try {
      await idm.refreshToken(request)
    } catch (e) {
      console.error(e)
    }
  }

  return h.continue
})
```

**Note:** This will execute for every single request to every route in your application, including static files. See [`demo/server.js`](demo/server.js) for an example of how you could only check the refresh token for requests to actual routes.

## Generating urls
DIHP uses OIDC's 'state' capability to be able to match up users it has sent to the IdP. This means that just before the user is sent to the IdP, a guid is generated, which is sent to the IdP, and stored locally in the cache.
When the user returns from the IdP, the state is returned with them. The state returned is matched with the entry in the cache to retrieve some persisted journey data.

This persisted journey data includes:
- The journey the user was sent to
- The policy the user was to be sent through
- Whether the user was forced to log in
- Where they should be sent to after authentication

It is important to send the user to B2C via the Outbound path exposed by DIHP. It is where the cache is populated with the above information.
You can generate an outbound url by executing the `idm.generateAuthenticationUrl` server method detailed in [server methods](#server-methods).

For example, you could generate an authentication url in your route handler and pass it to your view render function, like so:

**Route handler**
```
server.route({
    method: 'GET',
    path: '/',
    options: {
      auth: 'idm'
    },
    handler: async function (request, h) {
      return h.view('index', {
        authenticationUrl: server.methods.idm.generateAuthenticationUrl('/account')
      })
    }
})
```

**View file**
```
<a href="<%= authenticationUrl %>">Click here to log in</a>
```

## Enrolment
When a user visits your service for the first time, you must create an association between their contact record and your service. This is to indicate that the user in question has visited your service. The status of this enrolment can indicate to helpdesk personnel and to your service whether the user is allowed access or not.

You can find an example of the enrolment procedure in [demo/routes/enrolment.js](demo/routes/enrolment.js).

**Note:** In versions <4 you were restricted to setting the user's enrolment status to either "incomplete" or "pending" on creation. As of v4.0.0 this is no longer the case.

The available enrolment statuses are:

- Incomplete
    - This indicates that the user has not finished their registration to the service because you require additional information that has not been provided
- Pending
    - This indicates that the user has provided all required information, and the information is being processed in some way before a decision is made on whether to allow access to the service
- Complete - approved
    - All information has been processed and access to the service is permitted
- Complete - rejected
    - All information has been processed but access to the service has been denied

The ids associated with the above statuses can be referenced by the server method [`getMappings`](#idm-dynamics-getmappings)

These enrolment statuses are not assigned specifically to an individual. They are provided to an individual on behalf of an organisation, for a specific role.

A user could be an employee of multiple organisations, but have a complete approved status for one role for one organisation, but a rejected status for the same (or a different) role for another organisation. It is important to remember to set the correct enrolment statuses for each role and for each organisation.

For example, a user may have the following set of roles. Note the multiple different statuses between the organisations and roles:

```
- Organisation 1
    - Manager role
        - Status: Complete - approved
    - Data reader role
        - Status: Pending
- Organisation 2
    - Manager role
        - Status: Completed - rejected
    - User administrator
        - Status: Incomplete
```

## Server methods

The following server methods will be created by the plugin, for consumption inside or outside of the plugin.
You can read more about server methods [here](https://hapijs.com/tutorials/server-methods).

All server methods, with jsdocs can be found in [lib/methods](lib/methods)

### Authentication

##### `idm.getCredentials`
- Returns the user's session credentials - i.e. refresh token, expiry times of credentials

##### `idm.getClaims`
- Returns the user's claims
- Return object includes function attached to check whether the claims have expired. See [refresh token](#refresh-token)

##### `idm.generateAuthenticationUrl`
- Returns a url to the plugin's outboundPath
- Accepts parameters to specify
    - The url path that the user should be redirected to after authentication
    - Whether the user should be forced to log in (As opposed to the Identity App checking to see if they are already logged in and sending them straight through the process)
    - The journey name (Defaults to the default journey passed into the plugin on instantiation)
    - The policy name (Defaults to the default policy passed into the plugin on instantiation)

##### `idm.logout`
- Logs the user out
- Clears their cookie and cache record
- This is the method that your app's log out url calls

##### `idm.refreshToken`
- Refreshes the user's authentication JWT

##### `idm.generateOutboundRedirectUrl`
- Saves the user guid state in cache
- Returns the url to send a user straight to B2C (this is the function used by the outbound path route handler)
- **Note** This method will create a cache record every time you call it. Hence why it is only called when the user is actually outbound.

##### `idm.getCache`
- Returns the cache instance the plugin is using

##### `idm.getConfig`
- Returns the configuration the plugin is using
- This is useful to see what defaults have been applied

##### `idm.getInternals`
- Returns an object of methods that are for use within the plugin
- **Note:** It is not recommended to use these as they may change or be removed in the future and are not intended for use by consuming services

### Dynamics

#### Helpers

##### `idm.dynamics.getMappings`
- Returns an object containing lookups and mappings which you can use to pass relevant guids to other dynamics functions.
- For example: You can reference the enrolment status id of "complete - approved" by calling `server.methods.idm.dynamics.getMappings().enrolmentStatus.completeApproved`

##### `idm.dynamics.getToken`
- Returns a authentication token with which to call dynamics
- You are unlikely to need this, but you may wish to use it if you are calling dynamics outside of the methods exposed by the plugin

##### `idm.dynamics.parseAuthzRoles`
- Takes in the `roles` and `roleMappings` arrays from the user's JWT and returns an object of formatted roles

#### Update

##### `idm.dynamics.updateEnrolmentStatus`
- Use this to update the status of an existing enrolment

#### Read

##### `idm.dynamics.readCompanyNumbers`
- This will return the companies house id for the organisation id you pass it

##### `idm.dynamics.readContacts`
- Will query dynamics for users matching the input parameters

##### `idm.dynamics.readContactsAccountLinks`
- Queries dynamics for connections from the passed contact id to all associated account
- All users should be linked to at least one account. If this link is missing, then there may be an issue.

##### `idm.dynamics.readEnrolment`
- This will query dynamics for existing enrolments
- You should avoid calling this, and refer to your users roles in `idm.getClaims`

##### `idm.dynamics.readServiceRoles`
- This will query dynamics for all roles available to be assigned for the service associated with the service id passed in

#### Create

##### `idm.dynamics.createEnrolment`
- You should call this when a new user has landed on your service. This will indicate that the user has reached your service and should be passed straight to you next time they sign in

## Contributing to this project
If you have an idea you'd like to contribute please log an issue.

All contributions should be submitted via a pull request.

Please note that the codebase conforms to the [Jaavascript Standard Style](https://standardjs.com/).

Please make sure to run `npm test` and `npm run lint` before opening any pull requests.

## License

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the license

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable information providers in the public sector to license the use and re-use of their information under a common open licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
