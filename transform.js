var pred = require('./predicates')
var wrap = require('./wrap')
var transform

function dispatch(node, contin, varContin) {
  if (transform[node.type]) return transform[node.type](node, contin, varContin)
  return contin ? continuation(node, contin()) : node
}

function identity(x) { return x }

function endingContin() {
  return wrap.Identifier('__end')
}

function defaultContin() {
  return wrap.FunctionExpression(wrap.BlockStatement([]))
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
  prog.body = [wrap.ExpressionStatement(transformBlockStatement(prog, endingContin, decContin.add))]
  var decs = decContin.get()
  if (decs.declarations.length) prog.body.unshift(decs)
  return prog
}

function transformBlockStatement(block, contin, varContin) {
  var body = block.body
  function convertStatement(i) {
    var next = i + 1
    return next === body.length ? dispatch(body[i], contin, varContin)
         : dispatch(body[i], convertStatement.bind(null, next), varContin)
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
  /*
  return continuation(wrap.Literal(null), wrap.FunctionExpression(wrap.BlockStatement([varDec
    , wrap.ExpressionStatement(wrap.CallExpression(
        wrap.Identifier('__continuation'),
        [wrap.Literal(null), contin()]))
  ])))
  */
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

function transformBinaryExpression(binexp, contin, varContin) {
  return convertLeft()
  function convertLeft() {
    if (!pred.isSimple(binexp.left)) {
      var val1 = gensym()
      exp = dispatch(binexp.left, convertRight.bind(null, [val1]), varContin)
      binexp.left = val1
      return exp
    }
    else return convertRight([])
  }
  function convertRight(sym) {
    if (!pred.isSimple(binexp.right)) {
      var val2 = gensym()
      exp = dispatch(binexp.right, convertMain.bind(null, [val2]), varContin)
      exp.params = sym
      binexp.right = val2
      return exp
    }
    else return convertMain(sym)
  }
  function convertMain(sym) {
    var exp = continuation(binexp, contin())
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
    if (!pred.isSimple(callExp.callee)) {
      var sym = gensym()
      exp = dispatch(callExp.callee, convertArg.bind(null, 0, [sym]), varContin)
      callExp.callee = sym
      return exp
    }
    return convertArg(0, [])
  }
  function convertArg(i, param) {
    if (i === callExp.arguments.length) return finish(param)
    var arg = callExp.arguments[i]
    if (!pred.isSimple(arg)) {
      var sym = gensym()
      exp = dispatch(arg, convertArg.bind(null, i+1, [sym]), varContin)
      exp.params = param;
      callExp.arguments[i] = sym
      return exp
    }
    return convertArg(i+1, param)
  }
  function finish(param) {
    var exp = wrap.FunctionExpression(wrap.BlockStatement([wrap.ExpressionStatement(callExp)]))
    exp.params = param
    callExp.arguments.push(contin())
    return exp
  }
}

function transformSimple(simp, contin, varContin) {
  return continuation(simp, contin())
}

function transformReturnStatement(retSt, contin, varContin) {
  // Doesn't use contin only calls so that varDecs can be collected that come after return.
  // because when you get to a return theres nothing after...
  contin()
  return retSt.argument == null ? wrapReturn(null, identity)
       : dispatch(retSt.argument, wrapReturn.bind(null, gensym()), varContin)

}

function wrapReturn(val) {
  return wrap.FunctionExpression(wrap.BlockStatement([wrap.ExpressionStatement(wrap.CallExpression(wrap.Identifier('__return'), val == null ? null : [val]))]), [val])
}

function transformFunctionHelper(func, contin, varContin) {
  var decContin = makeVarContin()
  var bodyFunc = dispatch(func.body, wrapReturn, decContin.add)
  var decs = decContin.get()
  if (decs.declarations.length) bodyFunc.body.body.unshift(decs)
  bodyFunc.params = func.params.concat(wrap.Identifier('__return'))
  bodyFunc.id = func.id
  return bodyFunc
}

function transformFunctionExpression(func, contin, varContin) {
  var bodyFunc = transformFunctionHelper(func, contin, varContin)
  return continuation(bodyFunc, contin())
}

function transformFunctionDeclaration(func, contin, varContin) {
  var bodyFunc = transformFunctionHelper(func, contin, varContin)
  varContin(wrap.VariableDeclaration([wrap.VariableDeclarator(func.id, bodyFunc)]))
  return contin()
}

transform = { Identifier: transformSimple
            , Program: transformProgram
            , BlockStatement: transformBlockStatement
            , ExpressionStatement: transformExpressionStatement
            , FunctionExpression: transformFunctionExpression
            , FunctionDeclaration: transformFunctionDeclaration
            , CallExpression: transformCallExpression
            , Literal: transformSimple
            , VariableDeclaration: transformVariableDeclaration
            , BinaryExpression: transformBinaryExpression
            , ReturnStatement: transformReturnStatement
            , dispatch: dispatch
            }

module.exports = transform
