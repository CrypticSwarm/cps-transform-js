var esprima = require('esprima').parse
var escodegen = require('escodegen').generate
var instantiator = require('instantiator')
var matcher = require('js-matcher').match
var traverse = require('traverse')


// Predicates

function isFunction(node) {
  return node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration'
}

function isScoped(node) {
  return node.type === 'VariableDeclaration' || node.type === 'FunctionDeclaration'
}

function isBlock(node) {
  return node.type === 'Program' || node.type === 'BlockStatement'
}

function isSimple(node) {
  return node.type === 'Literal' || node.type === 'Identifier'
}

function transform(node, match, instan) {
  return instantiator(instan, matcher(match, node))
}

function fnDecToFnExp(ast) {
  if (ast.type === 'FunctionDeclaration') ast.type = 'FunctionExpression'
  return ast
}

function fnDecToVar(ast) {
  var fn = fnDecToFnExp(ast)
  return wrapVariableDec(fn.id, fn)
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
    if (isFunction(this.node)) this.block()
  })
}

function wrapExpression(ast) {
  if (ast.type === 'ExpressionStatement') return ast
  return { type: 'ExpressionStatement', expression: ast }
}

function bodyBlockType(type) {
  return function wrapBody(ast) {
    if (arguments.length > 1) ast = Array.prototype.slice.call(arguments)
    return { type: type, body: Array.isArray(ast) ? ast : [ast] }
  }
}
var wrapProgram = bodyBlockType('Program')
var wrapBlock = bodyBlockType('BlockStatement')

function wrapFunctionExp(ast, params) {
  return { type: 'FunctionExpression', id: null, params: params || [], body: ast }
}

function wrapCallExp(ast, args) {
  return { type: 'CallExpression', callee: ast, arguments: args || [] }
}

function wrapSequenceExp(ast) {
  return { type: 'SequenceExpression',  expressions: ast }
}

function wrapIdentifier(name) {
  return { type: 'Identifier',  name: name }
}

function wrapVariableDeclarator(id, init) {
  return { type: 'VariableDeclarator', id: id, init: init }
}

function wrapVariableDec(id, init) {
  return { type: 'VariableDeclaration', declarations: [wrapVariableDeclarator(id, init)], kind: 'var' }
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
    exps = exps.map(wrapExpression)
    cont.key = cont.parent.node.indexOf(cont.node)
    var args = [cont.key, 1].concat(exps)
    cont.parent.node.splice.apply(cont.parent.node, args)
  }
  else {
    if (exps.length > 1) exps = wrapSequenceExp(exps)
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
  var funcs = collect(fnBody, isFunction)
  fn(fnBody)
  funcs.forEach(function (tCont) {
    applyAllFuncs(tCont.node.body, fn)
  })
  return fnBody
}

function hoist(fnBody) {
  var vars = []
    , scoped = collect(fnBody, isScoped)
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
  return wrapExpression(wrapCallExp(wrapIdentifier('continuation'), [wrapFunctionExp(wrapBlock(ast))]))
}

function convertExpContinuation(ast, val, name) {
  return wrapCallExp(wrapIdentifier('continuation'), [val, wrapFunctionExp(wrapBlock(wrapExpression(ast)), [name])])
}

function dispatchCPSTransform(fnBody) {
  if (isBlock(fnBody)) return convertCPSBlock(fnBody)
  if (isFunction(fnBody)) return convertCPSFunc(fnBody)
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
  return wrapExpression(wrapCallExp(wrapIdentifier('__return'), [val]))
}

function convertCPSReturn(fnBody) {
  return wrapExpression(dispatchCPSExp(fnBody.argument, wrapReturn))
}

function convertCPSExp(fnBody) {
  return wrapExpression(dispatchCPSExp(fnBody.expression, wrapExpression))
}

function convertCPSCall(callExp, wrap) {
  callExp.callee = dispatchCPSTransform(callExp.callee)
  //callExp.arguments = callExp.arguments.
  return callExp
}

function wrapExpressionContinuation(identifier, ast) {
  return function wrapExpContin(val) {
    return wrapCallExp(wrapIdentifier('continuation'), [val, wrapFunctionExp(wrapBlock(wrapExpression(ast)), [identifier])])
  }
}

var gensym = (function () {
  var id = 0;
  return function gensym() {
    id++
    return wrapIdentifier('__val' + id)
  }
})()

function convertCPSBinary(fnBody, wrap) {
  var contin = wrap(fnBody)
  if (!isSimple(fnBody.right)) {
    var val2 = gensym()
    contin = dispatchCPSExp(fnBody.right, wrapExpressionContinuation(val2, contin))
    fnBody.right = val2
  }
  if (!isSimple(fnBody.left)) {
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
  return wrapFunctionExp(dispatchCPSTransform(fnBody.body))
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

