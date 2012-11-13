var transform = require('./transform')

function convertToCPS(fnBody) {
  return transform(fnBody)
}

module.exports = convertToCPS

