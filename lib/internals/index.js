const debug = require('debug')('defra.identity:internals')
const mappings = require('./mappings')

module.exports = (
  {
    server,
    cache,
    config
  }) => {
  debug('Registering internals...')

  const internals = {
    client: require('./client')({
      server,
      cache,
      config
    }),
    routes: require('./routes')({
      server,
      cache,
      config
    }),
    dynamics: {
      ...require('./dynamics')({
        server,
        cache,
        config
      }),
      mappings
    },
    root: require('./root')
  }

  debug('Done registering internals')

  return internals
}
