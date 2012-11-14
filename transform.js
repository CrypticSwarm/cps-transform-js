var pred = require('./predicates')
var wrap = require('./wrap')
var crypto = require('crypto')

var continId = wrap.Identifier('__continuation')
var pscopeId = wrap.Identifier('__parentScope')
var gscopeId = wrap.Identifier('__globalScope')
var scopeId = wrap.Identifier('__scope')
var createScopeId = wrap.Identifier('__createScopeObject')
var stackId = wrap.Identifier('__stack')
var pushStackId = wrap.Identifier('__pushStack')
var popStackId = wrap.Identifier('__popStack')
var undefinedId = wrap.Identifier('__undefined') 
var returnId = wrap.Identifier('__return')
var argId = wrap.Identifier('arguments')

var gensym = (function () {
  var id = 0
  return function gensym() {
    id++
    return wrap.Identifier('__val' + id)
  }
})()

function cloneSha(node, clone) {
  clone.sha = node.sha
  clone.parent = node.parent
  return clone
}

module.exports = function convert(node) {
  var transform
  var nodeList = {}
  function collect(node, parentProp, parentSha) {
    if (node.phantom) return node.sha = parentSha
    var h = crypto.createHash('sha1')
    if (parentProp) h.update(parentProp)
    if (parentSha) h.update(parentSha)
    h.update(JSON.stringify(node))
    var sha = h.digest('hex')
    node.sha = sha
    node.parent = parentSha
    nodeList[sha] = node
  }

  function dispatch(parent, prop, contin, varContin, parentSha) {
    var node = parent[prop]
    parentSha = parentSha || parent.sha
    collect(node, prop, parentSha)
    return transform[node.type] ? transform[node.type](node, contin, varContin)
        : continuation(node, contin())
  }

  function endingContin() {
    return wrap.Identifier('__end')
  }

  function continuation(val, func, sha) {
    sha = sha || val.sha
    var args = [wrap.Literal(sha), val]
    if (func != null) args.push(func)
    return wrap.FunctionExpression(wrap.BlockStatement([
      wrap.ExpressionStatement(
        wrap.CallExpression(continId, args))]))
  }

  function dotChain(arr) {
    return arr.map(wrap.Identifier).reduce(wrap.MemberExpression)
  }

  function addParentScope(body) {
    var parScope = wrap.VariableDeclaration([wrap.VariableDeclarator(pscopeId, scopeId)])
    body.unshift(parScope)
  }

  function makeVarContin(scope, parent) {
    var varDecs = []
    var info = []
    var propIndex = {}
    return { get: join
           , add: varDecs.push.bind(varDecs)
           , index: info.push.bind(info)
    }
    function join(otherProps) {
      var props =  varDecToScope(wrap.VariableDeclaration(varDecs.reduce(function appendVar(acc, node) {
        return acc.concat(node.declarations)
      }, [])), otherProps)
      info.forEach(function (identifier) {
        if (propIndex[identifier.name]) propIndex[identifier.name].push(identifier)
        else if (parent) parent.index(identifier)
      })
      collect(propIndex, scope.sha)
      var createScopeCall = wrap.CallExpression(createScopeId, [props, pscopeId, wrap.Literal(propIndex.sha)])
      var dec = wrap.VariableDeclaration([wrap.VariableDeclarator(scopeId, createScopeCall)])
      return [dec, propIndex]
    }
    function varDecToScope(decs, otherProps) {
      otherProps = otherProps || []
      var scopeDef = wrap.ObjectExpression(decs.declarations.map(function(dec) {
        propIndex[dec.id.name] = []
        // Possibly need to check for dups and make sure the second has no init it doesn't get added
        return wrap.Property(dec.id, dec.init == null ? undefinedId : dec.init)
      }).concat(otherProps))
      otherProps.forEach(function(prop) {
        propIndex[prop.key.name] = []
      })
      return scopeDef
    }
  }

  function transformProgram(prog) {
    collect(prog)
    nodeList.toplevel = prog
    var decContin = makeVarContin(prog)
    var bodyFunc = transformBlockStatement(prog, endingContin, decContin)
    var stackPush = wrap.CallExpression(pushStackId, [stackId, scopeId])
    prog = wrap.Program([stackPush, wrap.CallExpression(continuation(bodyFunc, null, prog.sha))].map(wrap.ExpressionStatement))
    var decs = decContin.get()
    decs[0].declarations.unshift(wrap.VariableDeclarator(pscopeId, gscopeId))
    prog.body.unshift(wrap.ExpressionStatement(wrap.AssignmentExpression(pscopeId, scopeId, '=')))
    prog.body.unshift(decs[0])
    return prog
  }

  function transformBlockStatement(block, contin, varContin) {
    var body = block.body
    function convertStatement(i) {
      return i === body.length ? contin()
          : dispatch(body, i, convertStatement.bind(null, i+1), varContin, block.sha)
    }
    return convertStatement(0)
  }

  function transformVariableDeclaration(varDec, contin, varContin) {
    // Pass varDecs to varContin
    // Transform in place Declarations with init into assignment statements
    varContin.add(varDec)
    return convertVarDec(0)
    function convertVarDec(i) {
      if (i === varDec.declarations.length) return contin()
      var dec = varDec.declarations[i]
      if (!dec.init) return convertVarDec(i+1)
      var assignExp = wrap.AssignmentExpression(dec.id, dec.init, '=')
      dec.init = null
      assignExp.phantom = true
      return dispatch({ phantom: assignExp, sha: varDec.sha }, 'phantom', convertVarDec.bind(null, i+1), varContin)
    }
  }


  function transformExpressionStatement(exp, contin, varContin) {
    return dispatch(exp, 'expression', contin, varContin)
  }

  function transformBinaryExpression(binExp, contin, varContin) {
    binExp = cloneSha(binExp, wrap.BinaryExpression(binExp.left, binExp.right, binExp.operator))
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

  function transformCallExpression(callExp, contin, varContin) {
    callExp = cloneSha(callExp, wrap.CallExpression(callExp.callee, callExp.arguments.slice()))
    return convertCallee()
    function convertCallee() {
      return convertHelper(callExp, 'callee', [], convertArg.bind(null, 0), varContin)
    }
    function convertArg(i, param) {
      return i === callExp.arguments.length ? finish(param)
          : convertHelper(callExp.arguments, i, param, convertArg.bind(null, i+1), varContin, callExp.sha)
    }
    function finish(param) {
      var exp = wrap.FunctionExpression(wrap.BlockStatement([wrap.ExpressionStatement(callExp)]))
      exp.params = param
      callExp.arguments.push(contin())
      return exp
    }
  }

  function convertHelper(subject, prop, defaultVal, contin, varContin, parentSha) {
    parentSha = parentSha || subject.sha
    if (!pred.isSimple(subject[prop])) {
      var sym = gensym()
      exp = dispatch(subject, prop, contin.bind(null, [sym]), varContin, parentSha)
      subject[prop] = sym
      exp.params = defaultVal
      return exp
    }
    else if (pred.isIdentifier(subject[prop])) {
      subject[prop] = dispatch(subject, prop, contin.bind(null, defaultVal), varContin, parentSha)
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
        : dispatch(retSt, 'argument', wrapReturn.bind(null, gensym()), varContin)
  }

  function wrapReturn(val) {
    var stackPop = wrap.CallExpression(popStackId, [stackId])
    var retExp = wrap.CallExpression(returnId, val == null ? null : [val])
    return wrap.FunctionExpression(wrap.BlockStatement(
      [stackPop, retExp].map(wrap.ExpressionStatement)
    ), [val])
  }

  function funcScopeProps(params) {
    var slice = dotChain(['Array', 'prototype', 'slice', 'call'])
    var props = params.map(function (param) {
      return wrap.Property(param, param)
    })
    props.push(wrap.Property(wrap.Identifier('this'), wrap.ThisExpression))
    props.push(wrap.Property(argId, wrap.CallExpression(slice, [argId, wrap.Literal(0), wrap.UnaryExpression('-', wrap.Literal(1))])))
    return props
  }

  function transformFunctionHelper(func, contin, varContin) {
    var decContin = makeVarContin(func, varContin)
    var bodyFunc = dispatch(func, 'body', wrapReturn, decContin)
    var stackPush = wrap.ExpressionStatement(wrap.CallExpression(pushStackId, [stackId, scopeId]))
    addParentScope(bodyFunc.body.body)
    var runBody = wrap.ExpressionStatement(wrap.CallExpression(continuation(bodyFunc, null, func.sha)))
    decContin.index.apply(decContin, func.params)
    var decInfo = decContin.get(funcScopeProps(func.params))
    func.body = wrap.BlockStatement([decInfo[0], stackPush, runBody ])
    func.params = func.params.concat(returnId)
    return func
  }

  function transformFunctionExpression(func, contin, varContin) {
    func = cloneSha(func, wrap.FunctionExpression(func.body, func.params.slice(), func.id))
    var bodyFunc = transformFunctionHelper(func, contin, varContin)
    return continuation(bodyFunc, contin(), func.sha)
  }

  function transformFunctionDeclaration(func, contin, varContin) {
    varContin.index(func.id)
    func = cloneSha(func, wrap.FunctionExpression(func.body, func.params.slice(), func.id))
    var bodyFunc = transformFunctionHelper(func, contin, varContin)
    varContin.add(wrap.VariableDeclaration([wrap.VariableDeclarator(func.id, bodyFunc)]))
    return contin()
  }

  function transformIdentifier(id, contin, varContin) {
    varContin.index(id)
    return wrap.MemberExpression(scopeId, id)
  }

  function transformIfStatement(ifSt, contin, varContin) {
    var nextSym = gensym()
    var varDec = wrap.VariableDeclaration([wrap.VariableDeclarator(nextSym, contin())])
    ifSt = cloneSha(ifSt, wrap.IfStatement(ifSt.test, ifSt.consequent, ifSt.alternate))
    return convertHelper(ifSt, 'test', [], convertIf, varContin)
    function getNextContin() {
      return wrap.FunctionExpression(wrap.BlockStatement([
        wrap.ExpressionStatement(wrap.CallExpression(nextSym))]))
    }
    function convertIf(sym) {
      ifSt.consequent = wrap.ExpressionStatement(wrap.CallExpression(dispatch(ifSt, 'consequent', getNextContin, varContin)))
      if (ifSt.alternate) ifSt.alternate = wrap.ExpressionStatement(wrap.CallExpression(dispatch(ifSt, 'alternate', getNextContin, varContin)))
      return wrap.FunctionExpression(wrap.BlockStatement([varDec, ifSt]), sym)
    }
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
              , IfStatement: transformIfStatement
              }

  return [transformProgram(node), nodeList]
}

