module.exports = {
  cookieName: 'idm',
  cacheSegment: 'idm',
  cacheCookieTtlMs: 24 * 60 * 60 * 1000,
  passRequestToCacheMethods: false,
  loginOnDisallow: false,
  isSecure: true,
  outboundPath: '/login/out',
  redirectUri: '/login/return',
  logoutPath: '/logout',
  disallowedRedirectPath: '/error',
  postAuthenticationRedirectJsPath: '/postAuthRedirect',
  onByDefault: false,
  defaultBackToPath: '/',
  callbacks: {},
  defaultScope: 'openid offline_access',
  retryDelayMultiplierSecs: 1.5
}
