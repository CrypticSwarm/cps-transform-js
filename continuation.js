continuation = (function () {
  var x = 0;
  return function continuation(fn) {
    x++
    console.log(x)
    setTimeout(fn, 1000)
  }
})()


continuation(function () {
  function makeAdder(a, _cont) {
    continuation(function () {
      function add(b, _cont) {
        continuation(function () {
          _cont(a + b)
        })
      }
      continuation(function () {
        _cont(add)
      })
    })
  }
  continuation(function () {
    makeAdder(5, function (_ret) {
      var add5 = _ret
      continuation(function () {
        add5(19, function (_ret) {
          var x = _ret
          continuation(function () {
            console.log(x)
          })
        })
      })
    })
  })
})





/*
--------------------------------
function makeAdder(a) {
  return add;
  function add(b) {
    return a + b;
  }
}

var add5 = makeAdder(5)

var x = add5(19)

console.log(x)


================================
*/
/*
continuation(function () {
  function add(_cont) {
    continuation(function () {
      var a = 1
      continuation(function () {
        var b = 2
        continuation(function () {
          _cont(a + b);
        })
      })
    })
  }
  continuation(function () {
    add(function (_ret) {
      var x = _ret 
      continuation(function() {
        console.log(x)
      })
    })
  })
})

*/
/*
-----------------------------------------

function add() {
  var a = 1
  var b = 2
  return a + b
}

var x = add()
console.log(x)
*/
