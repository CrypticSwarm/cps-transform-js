var pred = require('./predicates')
var wrap = require('./wrap')
var transform

function dispatch(node, wrap) {
  if (transform[node.type]) return transform[node.type](node, wrap)
  return wrap ? wrap(node, identity) : node
}

function identity(x) { return x }

function defaultContin(x, ret) {
  return ret(x)
}

function transformProgram(block) {
  return transformBlockStatement(block, defaultContin)
}

function transformBlockStatement(block, contin) {
  var body = block.body
  function convertStatement(i) {
    var next = i + 1
    var cur = body[i]
    return dispatch(cur, function (val, ret) {
      if (next == body.length) return contin(val, ret)
      return [ret(val), convertContinuation(convertStatement(next))]
    })
  }
  block.body = [convertContinuation(convertStatement(0))]
  return block
}

function transformVariableDeclaration(varDec, contin) {
  varDec.declarations.forEach(function (varDec) {
    if (varDec.init) dispatch(varDec.init, defaultContin)
  })
  return contin(varDec, identity)
}


function convertContinuation(ast) {
  return wrap.ExpressionStatement(wrap.CallExpression(wrap.Identifier('__continuation'),
                        [wrap.FunctionExpression(wrap.BlockStatement(ast))]))
}

function transformExpressionStatement(exp, contin) {
  return dispatch(exp.expression, function (val, ret) {
    return ret(contin(val, wrap.ExpressionStatement))
  })
}

var gensym = (function () {
  var id = 0;
  return function gensym() {
    id++
    return wrap.Identifier('__val' + id)
  }
})()

function transformBinaryExpression(binexp, contin) {
  var exp = contin(binexp, identity)
  if (!pred.isSimple(binexp.right)) {
    var val2 = gensym()
    exp = dispatch(binexp.right, wrapExpressionContinuation(val2, exp))
    binexp.right = val2
  }
  if (!pred.isSimple(binexp.left)) {
    var val1 = gensym()
    console.log('left-->', val1)
    exp = dispatch(binexp.left, wrapExpressionContinuation(val1, exp))
    binexp.left = val1
  }
  return exp
}

function wrapExpressionContinuation(identifier, ast) {
  return function wrapExpContin(val, ret) {
    console.log(val)
    return wrap.ExpressionStatement(wrap.CallExpression(wrap.Identifier('__continuation'), [val, wrap.FunctionExpression(wrap.BlockStatement(ret(ast)), [identifier])]))
  }
}

function transformCallExpression(callExp, contin) {
  var exp = wrap.ExpressionStatement(callExp)
  callExp.arguments = callExp.arguments.slice().reverse().map(function (arg) {
    if (!pred.isSimple(arg)) {
      var sym = gensym()
      exp = dispatch(arg, wrapExpressionContinuation(sym, exp))
      return sym
    }
    return arg
  }).reverse()
  if (!pred.isSimple(callExp.callee)) {
    var sym = gensym()
    exp = dispatch(callExp.callee, wrapExpressionContinuation(sym, exp))
    callExp.callee = sym
  }
  var sym = gensym()
  return contin(sym, function (val) {
    //console.log(exp.body[0].expression.arguments[0].body.body)
    callExp.arguments.push(wrap.FunctionExpression(wrap.BlockStatement(val), [sym]))
    return exp//wrap.ExpressionStatement(callExp)
  })
}

function transformSimple(simp, contin) {
  return contin(simp, identity)
}

function transformReturnStatement(retSt, contin) {
  // Doesn't call contin because when you get to a return theres nothing after...
  return retSt.argument == null ? wrapReturn(null, identity)
       : wrap.ExpressionStatement(dispatch(retSt.argument, wrapReturn))
}
function wrapReturn(val, ret) {
  return wrap.ExpressionStatement(wrap.CallExpression(wrap.Identifier('__return'), val == null ? null : [ret(val)]))
}

function transformFunctionExpression(func, contin) {
  return contin(func, function () {
    func.params.push(wrap.Identifier('__return'))
    func.body.body.push(wrap.ReturnStatement(null))
    return dispatch(func.body, wrap.FunctionExpression)
  })
}

transform = { Identifier: transformSimple
            , Program: transformProgram
            , BlockStatement: transformBlockStatement
            , ExpressionStatement: transformExpressionStatement
            , FunctionExpression: transformFunctionExpression
            , FunctionDeclaration: transformFunctionExpression
            , CallExpression: transformCallExpression
            , Literal: transformSimple
            , VariableDeclaration: transformVariableDeclaration
            , BinaryExpression: transformBinaryExpression
            , ReturnStatement: transformReturnStatement
            , dispatch: dispatch
            }

module.exports = transform
