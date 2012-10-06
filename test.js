var convert = require('./cpstransform')
var esprima = require('esprima').parse
var escodegen = require('escodegen').generate

function print(what) {
  process.stdout.write('\033[92m')
  process.stdout.write(what)
  process.stdout.write('\033[39m')
}

var __i_tick = 0;
function __continuation(val, cb) {
  if (arguments.length === 1) cb = val,val=null;
  setTimeout(function () {
    __i_tick++
    console.log('tick', __i_tick , ': ', val)
    cb(val)
  }, 1000)
}

print(escodegen(
  convert(
    esprima('1 + 2 + 3 + 4 + 5')
  )
))

console.log('\n')

print(escodegen(
  convert(
    esprima('var a=1,b=2,c=3,d=4; (function () { return a + b + (c + d) })()')
  )
))

