var pred = require('./predicates')
var wrap = require('./wrap')
var transform

function dispatch(node, wrap) {
  if (pred.isBlock(node)) return convertCPSBlock(node)
  if (pred.isFunction(node)) return convertCPSFunc(node)
  if (node.type === 'VariableDeclaration') return convertCPSVarDec(node)
  if (node.type === 'ExpressionStatement') return convertCPSExp(node)
  if (node.type === 'ReturnStatement') return transformReturnStatement(node)
  if (transform[node.type]) return transform[node.type](node, wrap)
  return node
}

function convertCPSBlock(block, wrap) {
  var body = block.body
  if (body.length) {
    body[body.length-1] = convertContinuation(dispatch(body[body.length-1]))
    body = body.reduceRight(function (a, b) {
      return convertContinuation([dispatch(b), a])
    })
    block.body = [body]
  }
  return block
}

function convertCPSVarDec(varDec) {
  varDec.declarations.forEach(function (varDec) {
    if (varDec.init) dispatch(varDec.init)
  })
  return varDec
}


function convertContinuation(ast) {
  return wrap.ExpressionStatement(wrap.CallExpression(wrap.Identifier('__continuation'), [wrap.FunctionExpression(wrap.BlockStatement(ast))]))
}

function convertExpContinuation(ast, val, name) {
  return wrap.CallExpression(wrap.Identifier('__continuation'), [val, wrap.FunctionExpression(wrapBlockStatement(wrap.ExpressionStatement(ast)), [name])])
}


function convertCPSExp(exp) {
  return wrap.ExpressionStatement(dispatch(exp.expression, wrap.ExpressionStatement))
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
  wrap(callExp)
  callExp.callee = dispatch(callExp.callee)
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

function convertCPSFunc(func) {
  return wrap.FunctionExpression(dispatch(func.body))
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
              , dispatch: dispatch
              }

module.exports = transform
