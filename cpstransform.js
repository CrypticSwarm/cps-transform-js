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

function varDecToExp(ast, noWrap) {
  return ast.declarations.map(function varDecToExp(node) {
    var exp = transform(node,
      { id: '$id', init: '$val' },
      { type: 'AssignmentExpression'
      , operator: '='
      , left: '$id'
      , right: '$val'
      })
    return noWrap ? exp : wrapExpression(exp)
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

function wrapFunctionExp(ast) {
  return wrapExpression({ type: 'FunctionExpression', id: null, params: [], body: wrapBlock(ast) })
}

function wrapSequenceExp(ast) {
  return { type: 'SequenceExpression',  expressions: ast }
}

function hoist(fnBody) {
  var hoistNodes = []
    , funcs = []
    , vars = []
  scopedTraverse(fnBody, function hoistBody(node) {
    if (node.type === 'FunctionDeclaration') {
      hoistNodes.push(this)
    }
    if (node.type === 'VariableDeclaration') {
      hoistNodes.push(this)
    }
    if (isFunction(node)) {
      hoist(node.body)
    }
  })
  hoistNodes.reverse().forEach(function (cont) {
    if (cont.node.type === 'FunctionDeclaration') {
      cont.parent.node.splice(cont.key, 1)
      funcs.push(cont.node)
    }
    if (cont.node.type === 'VariableDeclaration') {
      if (Array.isArray(cont.parent.node)) {
        cont.parent.node.splice.apply(cont.parent.node, [cont.key, 1].concat(varDecToExp(cont.node)))
      }
      else {
        var exps = varDecToExp(cont.node, true)
        if (exps.length > 1) exps = wrapSequenceExp(exps)
        else exps = exps[0]
        cont.parent.node[cont.key] = exps
      }
      vars.push(varClearInit(cont.node))
    }
  })
  fnBody.body = funcs.concat(vars, fnBody.body)
  return fnBody
}
