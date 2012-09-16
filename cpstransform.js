var fs = require('fs')
var esprima = require('esprima').parse
var escodegen = require('escodegen').generate
var instantiator = require('instantiator')
var matcher = require('js-matcher').match
var traverse = require('traverse')

function transform(node, match, instan) {
  return instantiator(instan, matcher(match, node))
}

function fnDecToFnExp(ast) {
  if (ast.type === 'FunctionDeclaration') ast.type = 'FunctionExpression'
  return ast
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

function scopedTraverse(fnBody, fn) {
  return traverse(fnBody).forEach(function scopedTraversal(node) {
    if (node.type) fn.call(this, node)
    if (isFunction(this.node)) this.block()
  })
}

function wrapExpression(ast) {
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

function isFunction(node) {
  return node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration'
}

function isScoped(node) {
  return node.type === 'VariableDeclaration' || node.type === 'FunctionDeclaration'
}

function wrapFunctionExp(ast) {
  return wrapExpression({ type: 'FunctionExpression', id: null, params: [], body: wrapBlock(ast) })
}

function wrapSequenceExp(ast) {
  return { type: 'SequenceExpression',  expressions: ast }
}

function collectScopedAndCallables(fnBody) {
  var collected = { scoped: [], callables: [] }
  scopedTraverse(fnBody, function collect(node) {
    if (isFunction(node)) collected.callables.push(this)
    if (isScoped(node)) collected.scoped.push(this)
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

function hoist(fnBody) {
  var funcs = []
    , vars = []
    , nodeCt = collectScopedAndCallables(fnBody)
  nodeCt.scoped.forEach(function (cont) {
    if (cont.node.type === 'FunctionDeclaration') {
      remove(cont)
      funcs.push(cont.node)
    }
    if (cont.node.type === 'VariableDeclaration') {
      replaces(varDecToExps(cont.node), cont)
      vars.push(varClearInit(cont.node))
    }
  })
  fnBody.body = funcs.concat(vars, fnBody.body)
  nodeCt.callables.forEach(function (cont) {
    hoist(cont.node.body)
  })
  return fnBody
}
