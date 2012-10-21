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
  }, 100)
}

function __end(val) {
  console.log('Ending value', val)
}

function run(str) {
  print(escodegen(convert(esprima(str, { loc: true, range: true }))).slice(0,-1) + '()')
}

run('plus(1+2, 3+4) + 5')
console.log('\n')
run('1 + 2 + 3 + 4+5+6; 3+4+5;4+5+6;')
console.log('\n')
run('function plus(a,b) { return a+b; }\n plus(1, 2)+3;')
console.log('\n')
run('var a=1,b=2,c=3,d=4,zzz=55,xxx=23; (function (a) { var x; return a + b + (c + d); var y, z = 4; })(zzz+xxx) + 2;')
console.log('\n')
run('function plus(a,b) { return a + b; }\n(plus(1,2) + plus(3+4+5,6+7+8))')
console.log('\n')
run('1 + 2 + 3 + 4; 3 + 2; 9 + 12; 123 + 123;')
/*

*/
