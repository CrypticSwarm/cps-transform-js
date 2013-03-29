var convert = require('./cpstransform')
var esprima = require('esprima').parse
var escodegen = require('escodegen').generate

var fs = require('fs')
var contents = fs.readFileSync(process.argv[2]).toString()

console.log(process.argv[2])
fs.writeFileSync('output.js', escodegen(convert(esprima(contents))[0]))
