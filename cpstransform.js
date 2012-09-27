var esprima = require('esprima').parse
var escodegen = require('escodegen').generate
var instantiator = require('instantiator')
var matcher = require('js-matcher').match
var traverse = require('traverse')
var wrap = require('./wrap')
var pred = require('./predicates')

function transform(node, match, instan) {
  return instantiator(instan, matcher(match, node))
}

function fnDecToFnExp(ast) {
  if (ast.type === 'FunctionDeclaration') ast.type = 'FunctionExpression'
  return ast
}

function fnDecToVar(ast) {
  var fn = fnDecToFnExp(ast)
  return wrap.VariableDeclaration(fn.id, fn)
}

function varDecToExps(ast, noWrap) {
  return ast.declarations.map(function varDecToExp(node) {
    return transform(node,
      { id: '$id', init: '$val' },
      { type: 'AssignmentExpression'
      , operator: '='
      , left: '$id'
      , right: '$val'
      })
  })
}

function varClearInit(ast) {
  ast.declarations.forEach(function varDecToExp(node) {
    node.init = null
  })
  return ast
}

function joinVars(varList) {
  if (varList.length < 1) return varList
  varList[0].declarations = varList.reduce(function appendVar(acc, node) {
    return acc.concat(node.declarations)
  }, [])
  return varList[0]
}

function scopedTraverse(fnBody, fn) {
  return traverse(fnBody).forEach(function scopedTraversal(node) {
    if (node.type) fn.call(this, node)
    if (pred.isFunction(this.node)) this.block()
  })
}


function collect(fnBody, typeFn) {
  var collected = []
  scopedTraverse(fnBody, function collectNodes(node) {
    if (typeFn(node)) collected.push(this)
  })
  return collected
}

function replaces(exps, cont) {
  if (Array.isArray(cont.parent.node)) {
    exps = exps.map(wrap.ExpressionStatement)
    cont.key = cont.parent.node.indexOf(cont.node)
    var args = [cont.key, 1].concat(exps)
    cont.parent.node.splice.apply(cont.parent.node, args)
  }
  else {
    if (exps.length > 1) exps = wrap.SequenceExpression(exps)
    else exps = exps[0]
    cont.parent.node[cont.key] = exps
  }
}

function remove(cont) {
  if (Array.isArray(cont.parent.node)) {
    cont.key = cont.parent.node.indexOf(cont.node)
    cont.parent.node.splice(cont.key, 1)
  }
  else {
    delete cont.parent.node[cont.key]
  }
}

function applyAllFuncs(fnBody, fn) {
  var funcs = collect(fnBody, pred.isFunction)
  fn(fnBody)
  funcs.forEach(function (tCont) {
    applyAllFuncs(tCont.node.body, fn)
  })
  return fnBody
}

function hoist(fnBody) {
  var vars = []
    , scoped = collect(fnBody, pred.isScoped)
  scoped.forEach(function removeDelcarations(cont) {
    if (cont.node.type === 'FunctionDeclaration') {
      remove(cont)
      vars.push(fnDecToVar(cont.node))
    }
    if (cont.node.type === 'VariableDeclaration') {
      replaces(varDecToExps(cont.node), cont)
      vars.push(varClearInit(cont.node))
    }
  })
  if (vars.length) {
    fnBody.body.unshift(joinVars(vars))
  }
  return fnBody
}

function hoistAll(fnBody) {
  return applyAllFuncs(fnBody, hoist)
}

function convertContinuation(ast) {
  return wrap.ExpressionStatement(wrap.CallExpression(wrap.Identifier('__continuation'), [wrap.FunctionExpression(wrap.BlockStatement(ast))]))
}

function convertExpContinuation(ast, val, name) {
  return wrap.CallExpression(wrap.Identifier('__continuation'), [val, wrap.FunctionExpression(wrapBlockStatement(wrap.ExpressionStatement(ast)), [name])])
}

function dispatchCPSTransform(fnBody) {
  if (pred.isBlock(fnBody)) return convertCPSBlock(fnBody)
  if (pred.isFunction(fnBody)) return convertCPSFunc(fnBody)
  if (fnBody.type === 'VariableDeclaration') return convertCPSVarDec(fnBody)
  if (fnBody.type === 'ExpressionStatement') return convertCPSExp(fnBody)
  if (fnBody.type === 'ReturnStatement') return convertCPSReturn(fnBody)
  return fnBody
}

function dispatchCPSExp(fnBody, wrap) {
  if (fnBody.type === 'BinaryExpression') return convertCPSBinary(fnBody, wrap)
  if (fnBody.type === 'CallExpression') return convertCPSCall(fnBody, wrap)
  return fnBody
}

function wrapReturn(val) {
  return wrap.ExpressionStatement(wrap.CallExpression(wrap.Identifier('__return'), [val]))
}

function convertCPSReturn(fnBody) {
  return wrap.ExpressionStatement(dispatchCPSExp(fnBody.argument, wrapReturn))
}

function convertCPSExp(fnBody) {
  return wrap.ExpressionStatement(dispatchCPSExp(fnBody.expression, wrap.ExpressionStatement))
}

function convertCPSCall(callExp, wrap) {
  callExp.callee = dispatchCPSTransform(callExp.callee)
  //callExp.arguments = callExp.arguments.
  return callExp
}

function wrapExpressionContinuation(identifier, ast) {
  return function wrapExpContin(val) {
    return wrap.CallExpression(wrap.Identifier('__continuation'), [val, wrap.FunctionExpression(wrap.BlockStatement(wrap.ExpressionStatement(ast)), [identifier])])
  }
}

var gensym = (function () {
  var id = 0;
  return function gensym() {
    id++
    return wrap.Identifier('__val' + id)
  }
})()

function convertCPSBinary(fnBody, wrap) {
  var contin = wrap(fnBody)
  if (!pred.isSimple(fnBody.right)) {
    var val2 = gensym()
    contin = dispatchCPSExp(fnBody.right, wrapExpressionContinuation(val2, contin))
    fnBody.right = val2
  }
  if (!pred.isSimple(fnBody.left)) {
    var val1 = gensym()
    contin = dispatchCPSExp(fnBody.left, wrapExpressionContinuation(val1, contin))
    fnBody.left = val1
  }
  return contin
}

function convertCPSVarDec(fnBody) {
  fnBody.declarations.forEach(function (varDec) {
    if (varDec.init) dispatchCPSTransform(varDec.init)
  })
  return fnBody
}

function convertCPSFunc(fnBody) {
  return wrap.FunctionExpression(dispatchCPSTransform(fnBody.body))
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

function convertToCPS(fnBody) {
  return dispatchCPSTransform(hoistAll(fnBody))
}

