var pred = require('./predicates')
var wrap = require('./wrap')
var transform

function dispatch(node, wrap) {
  if (transform[node.type]) return transform[node.type](node, wrap)
  return wrap ? wrap(node) : node
}

function identity(x) { return x }

function transformProgram(block) {
  var x = transformBlockStatement(block, identity)
  console.log(x.body[0].expression.arguments[0].body.body[0])
  return x
}

function transformBlockStatement(block, contin) {
  var body = block.body
  function convertStatement(i) {
    var next = i + 1
    var cur = body[i]
    if (next == body.length) return wrap.EmptyStatement//dispatch(cur, contin)
    return dispatch(cur, function (val) {
      return [val, convertContinuation(convertStatement(next))]
    })
  }
  var b = convertStatement(0)
  block.body = [wrap.ExpressionStatement(convertContinuation(b))]
  return block
}

function transformVariableDeclaration(varDec, wrap) {
  varDec.declarations.forEach(function (varDec) {
    if (varDec.init) dispatch(varDec.init)
  })
  return wrap(varDec)
}


function convertContinuation(ast) {
  return wrap.CallExpression(wrap.Identifier('__continuation'),
                        [wrap.FunctionExpression(wrap.BlockStatement(ast))])
}

function convertExpContinuation(ast, val, name) {
  return wrap.CallExpression(wrap.Identifier('__continuation'), [val, wrap.FunctionExpression(wrapBlockStatement(wrap.ExpressionStatement(ast)), [name])])
}

function compose() {
  var funcs = Array.prototype.slice.call(arguments)
  return function (x) {
    return funcs.reduceRight(function callFunc(a, fn) {
      return fn(a)
    }, x)
  }
}

function transformExpressionStatement(exp, contin) {
  return wrap.ExpressionStatement(dispatch(exp.expression, compose(contin, wrap.ExpressionStatement)))
}

var gensym = (function () {
  var id = 0;
  return function gensym() {
    id++
    return wrap.Identifier('__val' + id)
  }
})()

function transformBinaryExpression(binexp, wrap) {
  var contin = wrap(binexp)
  if (!pred.isSimple(binexp.right)) {
    var val2 = gensym()
    contin = dispatch(binexp.right, wrapExpressionContinuation(val2, contin))
    binexp.right = val2
  }
  if (!pred.isSimple(binexp.left)) {
    var val1 = gensym()
    contin = dispatch(binexp.left, wrapExpressionContinuation(val1, contin))
    binexp.left = val1
  }
  return contin
}

function wrapExpressionContinuation(identifier, ast) {
  return function wrapExpContin(val) {
    return wrap.CallExpression(wrap.Identifier('__continuation'), [val, wrap.FunctionExpression(wrap.BlockStatement(wrap.ExpressionStatement(ast)), [identifier])])
  }
}


function transformCallExpression(callExp, wrap) {
  var contin = dispatch(callExp.callee, function (callee) {
    callExp.callee = callee
  })
  // collect arguments via gensyms
  // add extra arg on the end for rest of computation
  //callExp.arguments = callExp.arguments.
  return callExp
}

function transformSimple(simp, wrap) {
  return wrap(simp)
}

function transformReturnStatement(retSt) {
  return wrap.ExpressionStatement(dispatch(retSt.argument, wrapReturn))
}
function wrapReturn(val) {
  return wrap.ExpressionStatement(wrap.CallExpression(wrap.Identifier('__return'), [val]))
}

function transformFunctionExpression(func) {
  return wrap.FunctionExpression(dispatch(func.body, identity))
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
