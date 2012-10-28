var convert = require('./cpstransform')
var esprima = require('esprima').parse
var escodegen = require('escodegen').generate

function print(what) {
  process.stdout.write('\033[92m')
  process.stdout.write(what)
  process.stdout.write('\033[39m')
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
      //console.log(curItem)
      cb(val)
    }, 0)
  }
  eval(escodegen(convert(esprima(str, { loc: true, range: true }))))
}

run('function plus(a,b) { return a + b; }\nplus(1+2, 3+4) + 5', 15)
console.log('\n')
run('1 + 2 + 3 + 4+5+6* 3+4+5*4+5+6;', 68)
console.log('\n')
run('function plus(a,b) { return a+b; }\n plus(1, 2)+3;', 6)
console.log('\n')
run('var a=1,b=2,c=3,d=4,zzz=55,xxx=23; (function (a) { var x; return a + b + (c + d); var y, z = 4; })(zzz+xxx) + 2;', 89)
console.log('\n')
run('function plus(a,b) { return a + b; }\n(plus(1,2) + plus(3+4+5,6+7+8))', 36)
console.log('\n')
run('1 + 2 + 3 + 4; 3 + 2; 9 + 12; 123 + 123;', 246)
