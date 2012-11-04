var convert = require('./cpstransform')
var esprima = require('esprima').parse
var escodegen = require('escodegen').generate
var showCode = process.argv.some(function (arg) {
  if (arg === '--code') return true
})

function print(what) {
  process.stdout.write('\033[92m')
  process.stdout.write(what)
  process.stdout.write('\033[39m')
  process.stdout.write('\n\n')
}


function __createScopeObject(scopeDef, parentScope) {
  var scope =  Object.create(parentScope, scope)
  Object.keys(scopeDef).forEach(function(key) {
    scope[key] = scopeDef[key]
  })
  return scope
}

var runCounter = 0
function run(str, expected) {
  var __i_tick = 0
  var __undefined
  var __globalScope = {}
  var __stack = []
  var runNum = ++runCounter

  function __end(val) {
    if (val === expected) {
      console.log('\033[0;32mRun number (' + runNum + ')\033[m')
    }
    else {
      console.log('\033[0;31mRun number (' + runNum + ')\033[m', val, expected)
    }
  }

  function __continuation(val, cb) {
    if (arguments.length === 1) cb = val,val=null;
    setTimeout(function () {
      __i_tick++
      var curItem = __stack[__stack.length - 1]
      //console.log('tick', __i_tick , ': ', val)
      //console.log(__stack)
      //console.log(val)
      cb(val)
    }, 0)
  }
  var code = escodegen(convert(esprima(str, { loc: true, range: true })))
  if (showCode) print(code)
  else eval(code)
}

run('function plus(a,b) { return a + b; }\nplus(1+2, 3+4) + 5', 15)
run('function makeAdder(a){ return function plus(b) { return a + b } }\nvar add1 = makeAdder(1); var add2 = makeAdder(2); add1(5) + add2(6);', 14)
run('1 + 2 + 3 + 4+5+6* 3+4+5*4+5+6;', 68)
run('function plus(a,b) { return a+b; }\n plus(1, 2)+3;', 6)
run('var a=1,b=2,c=3,d=4,zzz=55,xxx=23; (function (a) { var x; return a + b + (c + d); var y, z = 4; })(zzz+xxx) + 2;', 89)
run('function plus(a,b) { return a + b; }\n(plus(1,2) + plus(3+4+5,6+7+8))', 36)
run('1 + 2 + 3 + 4; 3 + 2; 9 + 12; 123 + 123;', 246)
run('if (x) x = 4; else x = 5; x+1', 6)
run('factorial(5)\nfunction factorial(n) { var x; if (n === 0) x = 1; else x = n * factorial(n - 1); return x+0 }', 120)
