var pred = require('./predicates')
var wrap = require('./wrap')
var transform

function dispatch(node, contin, varContin) {
  return transform[node.type] ? transform[node.type](node, contin, varContin)
       : continuation(node, contin())
}

function endingContin() {
  return wrap.Identifier('__end')
}

function makeVarContin() {
  var varDecs = []
  return { get: function () { return join() }
         , add: function (dec) { varDecs.push(dec) }
  }
  function join() {
    return wrap.VariableDeclaration(varDecs.reduce(function appendVar(acc, node) {
      return acc.concat(node.declarations)
    }, []))
  }
}

function transformProgram(prog) {
  var decContin = makeVarContin()
  var bodyFunc = transformBlockStatement(prog, endingContin, decContin.add)
  var stackPush = wrap.CallExpression(dotChain(['__stack', 'push']), [wrap.Identifier('__scope')])
  prog.body = [stackPush, wrap.CallExpression(bodyFunc)].map(wrap.ExpressionStatement)
  var decs = varDecToScope(decContin.get())
  decs.declarations.unshift(wrap.VariableDeclarator(wrap.Identifier('__parentScope'), wrap.Identifier('__globalScope')))
  addParentScope(bodyFunc.body.body)
  prog.body.unshift(decs)
  return prog
}

function transformBlockStatement(block, contin, varContin) {
  var body = block.body
  function convertStatement(i) {
    return i === body.length ? contin()
         : dispatch(body[i], convertStatement.bind(null, i+1), varContin)
  }
  return convertStatement(0)
}

function transformVariableDeclaration(varDec, contin, varContin) {
  // Pass varDecs to varContin
  // Transform in place Declarations with init into assignment statements
  varContin(varDec)
  return convertVarDec(0)
  function convertVarDec(i) {
    if (i === varDec.declarations.length) return contin()
    var dec = varDec.declarations[i]
    if (!dec.init) return convertVarDec(i+1)
    var assignExp = wrap.AssignmentExpression(dec.id, dec.init, '=')
    dec.init = null
    return dispatch(assignExp, convertVarDec.bind(null, i+1), varContin)
  }
}


function transformExpressionStatement(exp, contin, varContin) {
  return dispatch(exp.expression, contin, varContin)
}

var gensym = (function () {
  var id = 0;
  return function gensym() {
    id++
    return wrap.Identifier('__val' + id)
  }
})()

function transformBinaryExpression(binExp, contin, varContin) {
  return convertLeft()
  function convertLeft() {
    return convertHelper(binExp, 'left', [], convertRight, varContin)
  }
  function convertRight(sym) {
    return convertHelper(binExp, 'right', sym, convertMain, varContin)
  }
  function convertMain(sym) {
    var exp = continuation(binExp, contin())
    exp.params = sym
    return exp
  }
}

function continuation(val, func) {
  return wrap.FunctionExpression(wrap.BlockStatement([
    wrap.ExpressionStatement(
      wrap.CallExpression(
        wrap.Identifier('__continuation'),
        [val, func]))]))
}

function transformCallExpression(callExp, contin, varContin) {
  return convertCallee()
  function convertCallee() {
    return convertHelper(callExp, 'callee', [], convertArg.bind(null, 0), varContin)
  }
  function convertArg(i, param) {
    return i === callExp.arguments.length ? finish(param)
         : convertHelper(callExp.arguments, i, param, convertArg.bind(null, i+1), varContin)
  }
  function finish(param) {
    var exp = wrap.FunctionExpression(wrap.BlockStatement([wrap.ExpressionStatement(callExp)]))
    exp.params = param
    callExp.arguments.push(contin())
    return exp
  }
}

function convertHelper(subject, prop, defaultVal, contin, varContin) {
  if (!pred.isSimple(subject[prop])) {
    var sym = gensym()
    exp = dispatch(subject[prop], contin.bind(null, [sym]), varContin)
    subject[prop] = sym
    exp.params = defaultVal
    return exp
  }
  else if (pred.isIdentifier(subject[prop])) {
    subject[prop] = dispatch(subject[prop], contin.bind(null, defaultVal), varContin)
  }
  return contin(defaultVal)
}

function transformLiteral(simp, contin, varContin) {
  return continuation(simp, contin())
}

function transformReturnStatement(retSt, contin, varContin) {
  // Doesn't use contin only calls so that varDecs can be collected that come after return.
  // because when you get to a return theres nothing after...
  contin()
  return retSt.argument == null ? wrapReturn(null)
       : dispatch(retSt.argument, wrapReturn.bind(null, gensym()), varContin)

}

function wrapReturn(val) {
  var stackPop = wrap.CallExpression(dotChain(['__stack', 'pop']))
  var retExp = wrap.CallExpression(wrap.Identifier('__return'), val == null ? null : [val])
  return wrap.FunctionExpression(wrap.BlockStatement(
    [stackPop, retExp].map(wrap.ExpressionStatement)
  ), [val])
}

function dotChain(arr) {
  return arr.map(wrap.Identifier).reduce(wrap.MemberExpression)
}

function funcScopeProps(params) {
  var arg = wrap.Identifier('arguments')
  var slice = dotChain(['Array', 'prototype', 'slice', 'call'])
  var props = params.map(function (param) {
    return wrap.Property(param, param)
  })
  props.push(wrap.Property(wrap.Identifier('this'), wrap.ThisExpression))
  props.push(wrap.Property(arg, wrap.CallExpression(slice, [arg])))
  return props
}

function varDecToScope(decs, otherProps) {
  var scopeDef = wrap.ObjectExpression(decs.declarations.map(function(dec) {
    return wrap.Property(dec.id, dec.init == null ? wrap.Identifier('__undefined') : dec.init)
  }).concat(otherProps || []))
  var scope = wrap.CallExpression(wrap.Identifier('__createScopeObject'), [scopeDef, wrap.Identifier('__parentScope')])
  return wrap.VariableDeclaration([wrap.VariableDeclarator(wrap.Identifier('__scope'), scope)])
}

function addParentScope(body) {
  var parentScope = wrap.Identifier('__parentScope')
  var scope = wrap.Identifier('__scope')
  var parScope = wrap.VariableDeclaration([wrap.VariableDeclarator(parentScope, scope)])
  body.unshift(parScope)
}

function transformFunctionHelper(func, contin, varContin) {
  var decContin = makeVarContin()
  var bodyFunc = dispatch(func.body, wrapReturn, decContin.add)
  var decs = decContin.get()
  var stackPush = wrap.ExpressionStatement(wrap.CallExpression(dotChain(['__stack', 'push']), [wrap.Identifier('__scope')]))
  addParentScope(bodyFunc.body.body)
  var runBody = wrap.ExpressionStatement(wrap.CallExpression(bodyFunc))
  func.body.body = [ varDecToScope(decs, funcScopeProps(func.params)), stackPush, runBody ]
  func.params = func.params.concat(wrap.Identifier('__return'))
  return func
}

function transformFunctionExpression(func, contin, varContin) {
  var bodyFunc = transformFunctionHelper(func, contin, varContin)
  return continuation(bodyFunc, contin())
}

function transformFunctionDeclaration(func, contin, varContin) {
  func.type = 'FunctionExpression'
  var bodyFunc = transformFunctionHelper(func, contin, varContin)
  varContin(wrap.VariableDeclaration([wrap.VariableDeclarator(func.id, bodyFunc)]))
  return contin()
}

function transformIdentifier(id, contin, varContin) {
  return wrap.MemberExpression(wrap.Identifier('__scope'), id);
}

transform = { Identifier: transformIdentifier
            , Program: transformProgram
            , BlockStatement: transformBlockStatement
            , ExpressionStatement: transformExpressionStatement
            , FunctionExpression: transformFunctionExpression
            , FunctionDeclaration: transformFunctionDeclaration
            , CallExpression: transformCallExpression
            , Literal: transformLiteral
            , VariableDeclaration: transformVariableDeclaration
            , BinaryExpression: transformBinaryExpression
            , AssignmentExpression: transformBinaryExpression
            , ReturnStatement: transformReturnStatement
            , dispatch: dispatch
            }

module.exports = transform
