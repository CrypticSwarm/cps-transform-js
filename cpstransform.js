var hoist = require('./hoist')
var transform = require('./transform')

function convertToCPS(fnBody) {
  return transform.dispatch(hoist(fnBody))
}

module.exports = convertToCPS

