var pred = require('./predicates')
var wrap = require('./wrap')
var transform

function dispatchCPSTransform(node, wrap) {
  if (pred.isBlock(node)) return convertCPSBlock(node)
  if (pred.isFunction(node)) return convertCPSFunc(node)
  if (node.type === 'VariableDeclaration') return convertCPSVarDec(node)
  if (node.type === 'ExpressionStatement') return convertCPSExp(node)
  if (node.type === 'ReturnStatement') return transformReturnStatement(node)
  if (transform[node.type]) return transform[node.type](node, wrap)
  return node
}

function convertCPSBlock(fnBody) {
  var body = fnBody.body
  if (body.length) {
    body[body.length-1] = convertContinuation(dispatchCPSTransform(body[body.length-1]))
    body = body.reduceRight(function (a, b) {
      return convertContinuation([dispatchCPSTransform(b), a])
    })
    fnBody.body = [body]
  }
  return fnBody
}

function convertCPSVarDec(fnBody) {
  fnBody.declarations.forEach(function (varDec) {
    if (varDec.init) dispatchCPSTransform(varDec.init)
  })
  return fnBody
}


function convertContinuation(ast) {
  return wrap.ExpressionStatement(wrap.CallExpression(wrap.Identifier('__continuation'), [wrap.FunctionExpression(wrap.BlockStatement(ast))]))
}

function convertExpContinuation(ast, val, name) {
  return wrap.CallExpression(wrap.Identifier('__continuation'), [val, wrap.FunctionExpression(wrapBlockStatement(wrap.ExpressionStatement(ast)), [name])])
}


function convertCPSExp(fnBody) {
  return wrap.ExpressionStatement(dispatchCPSTransform(fnBody.expression, wrap.ExpressionStatement))
}

var gensym = (function () {
  var id = 0;
  return function gensym() {
    id++
    return wrap.Identifier('__val' + id)
  }
})()

function transformBinaryExpression(fnBody, wrap) {
  var contin = wrap(fnBody)
  if (!pred.isSimple(fnBody.right)) {
    var val2 = gensym()
    contin = dispatchCPSTransform(fnBody.right, wrapExpressionContinuation(val2, contin))
    fnBody.right = val2
  }
  if (!pred.isSimple(fnBody.left)) {
    var val1 = gensym()
    contin = dispatchCPSTransform(fnBody.left, wrapExpressionContinuation(val1, contin))
    fnBody.left = val1
  }
  return contin
}

function wrapExpressionContinuation(identifier, ast) {
  return function wrapExpContin(val) {
    return wrap.CallExpression(wrap.Identifier('__continuation'), [val, wrap.FunctionExpression(wrap.BlockStatement(wrap.ExpressionStatement(ast)), [identifier])])
  }
}


function transformCallExpression(callExp, wrap) {
  wrap(callExp)
  callExp.callee = dispatchCPSTransform(callExp.callee)
  //callExp.arguments = callExp.arguments.
  return callExp
}

function transformSimple(simp, wrap) {
  return wrap(simp)
}

function transformReturnStatement(fnBody) {
  return wrap.ExpressionStatement(dispatchCPSTransform(fnBody.argument, wrapReturn))
}
function wrapReturn(val) {
  return wrap.ExpressionStatement(wrap.CallExpression(wrap.Identifier('__return'), [val]))
}

function convertCPSFunc(fnBody) {
  return wrap.FunctionExpression(dispatchCPSTransform(fnBody.body))
}

transform = { Identifier: transformSimple
            //  , Program: transformProgram
            //  , BlockStatement: transformBlockStatement
            //  , ExpressionStatement: transformExpressionStatement
            //  , FunctionExpression: transformFunctionExpression
              , CallExpression: transformCallExpression
            //  , SequenceExpression: transformSequenceExpression
              , Literal: transformSimple
            //  , VariableDeclarator: transformVariableDeclarator
            //  , VariableDeclaration: transformVariableDeclaration
              , BinaryExpression: transformBinaryExpression
              , ReturnStatement: transformReturnStatement
              , dispatch: dispatchCPSTransform
              }

module.exports = transform
