var fs = require('fs')
var esprima = require('esprima').parse
var escodegen = require('escodegen').generate
var instantiator = require('instantiator')
var matcher = require('js-matcher').match
var traverse = require('traverse')

function isFunction(node) {
  return node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration'
}

function isScoped(node) {
  return node.type === 'VariableDeclaration' || node.type === 'FunctionDeclaration'
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

function wrapFunctionExp(ast) {
  return { type: 'FunctionExpression', id: null, params: [], body: wrapBlock(ast) }
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
  return wrapExpression(wrapCallExp(wrapIdentifier('continuation'), [wrapFunctionExp(ast)]))
}

function convertToCPS(fnBody) {
  fnBody = hoistAll(fnBody)
  var body = fnBody.body
  if (body.length) {
    body[body.length-1] = convertContinuation(body[body.length-1])
    body = body.reverse().reduce(function (a, b) {
      return convertContinuation([b, a])
    })
    fnBody.body = [body]
  }
  return fnBody
}

