var convert = require('./transform')
var esprima = require('esprima').parse
var escodegen = require('escodegen').generate

var fs = require('fs')
var contents = fs.readFileSync(process.argv[2]).toString()

fs.writeFileSync(process.argv[3], escodegen(convert(esprima(contents))[0]))
