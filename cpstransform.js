var transform = require('./transform')

function convertToCPS(fnBody) {
  return transform.dispatch(fnBody)
}

module.exports = convertToCPS

