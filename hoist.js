var wrap = require('./wrap')
var pred = require('./predicates')
var traverse = require('traverse')

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
    var init = node.init
    if (init) return wrap.AssignmentExpression(node.id, node.init, '=')
  }).filter(function removeEmptyVars(node) {
    return node
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
    if (node == null) return;
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

function ret(a) {
  return function (item) {
    return item[a]
  }
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

module.exports = hoistAll

