const qs = require('querystring')
const _ = require('lodash')
const debug = require('debug')('defra.identity:internals:root')

const _delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

module.exports = (
  {
    config
  }) => {
  const redirectTo = (loginOnDisallow, disallowedRedirectPath, server) => (request) => {
    const { path } = request

    let redirectTo

    if (loginOnDisallow) {
      redirectTo = server.methods.idm.generateAuthenticationUrl(path)
    } else {
      redirectTo = disallowedRedirectPath

      redirectTo += '?' + qs.stringify({
        notLoggedInErr: 'yes'
      })
    }

    return redirectTo
  }

  const validateFunc = (server) => async (request) => {
    // Retrieve from session store
    const credentials = await server.methods.idm.getCredentials(request)

    return {
      valid: credentials && !credentials.isExpired(),
      credentials
    }
  }

  /**
   * Function that will execute a function and pass the response to a callback to determine whether to retry the execution
   *
   * @param {Function} toExecute Function to execute
   * @param {Function} onResponse Callback to be called that will determine whether to retry the execution or not
   * @returns {Promise<*>} The outcome of toExecute
   */
  const retryable = async (toExecute, onResponse) => {
    let iterationCount = 1
    let shouldRetry = true
    let err
    let response

    while (shouldRetry) {
      try {
        response = await toExecute()
      } catch (e) {
        err = e
      }

      /**
       * The callback to be executed if the request is to be retried. If delayMs is provided, that amount of milliseconds will be waited before retrying
       *
       * @param {Number} delayMs
       * @returns {Promise<void>}
       */
      const retry = async (delayMs) => {
        debug(`Retrying after ${iterationCount} try after a delay of ${delayMs || 0}ms`)

        iterationCount++

        if (delayMs) {
          await _delay(delayMs)
        }
      }

      /**
       * The callback to be executed if the request is not to be retried,
       */
      const doNotRetry = () => {
        shouldRetry = false
      }

      await onResponse(err, response, iterationCount, retry, doNotRetry)
    }

    return response
  }

  /**
   * A callback function which can be passed to retryable to retry any b2c requests
   *
   * @param {Error} err Error thrown by b2c request
   * @param {*} response Response from b2c request
   * @param {number} iterationCount The number of times the request has been tried already
   * @param {Function} retry The callback to execute if the request should be retried
   * @param {Function} doNotRetry The callback to execute if the request should not be retried
   * @returns {void|Promise}
   */
  retryable.b2cRequestRetry = (err, response, iterationCount, retry, doNotRetry) => {
    const retryAfterHeader = _.get(response, ['headers', 'Retry-After'])

    // Don't retry if we don't have an error and if B2C didn't tell us to retry
    if (!err && !retryAfterHeader) {
      return doNotRetry()
    }

    // If we've had fewer errors than our limit, try again
    if (iterationCount < 3) {
      // If a Retry-After header is supplied, use that - if not, then increase the delay on every attempt
      const retryDelayMs = (retryAfterHeader || (iterationCount * config.retryDelayMultiplierSecs)) * 1000

      return retry(retryDelayMs)
    }

    // Hit the retry limit - rethrow the error so it can be handled at the top level
    throw err || Error('Retry-After header found but retry limit hit')
  }

  return {
    redirectTo,
    validateFunc,
    retryable
  }
}
