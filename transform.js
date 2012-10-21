var pred = require('./predicates')
var wrap = require('./wrap')
var transform

function dispatch(node, contin) {
  if (transform[node.type]) return transform[node.type](node, contin)
  return contin ? continuation(node, contin()) : node
}

function identity(x) { return x }

function defaultContin(x) {
  return wrap.FunctionExpression(wrap.BlockStatement([]))
}

function transformProgram(prog) {
  prog.body = [wrap.ExpressionStatement(transformBlockStatement(prog, defaultContin))]
  return prog
}

function transformBlockStatement(block, contin) {
  var body = block.body
  function convertStatement(i) {
    var next = i + 1
    return next === body.length ? dispatch(body[i], contin)
         : dispatch(body[i], convertStatement.bind(null, next))
  }
  return convertStatement(0)
}

function transformVariableDeclaration(varDec, contin) {
  varDec.declarations.forEach(function (varDec) {
    if (varDec.init) dispatch(varDec.init, defaultContin)
  })
  return continuation(wrap.Literal(null), wrap.FunctionExpression(wrap.BlockStatement([varDec
    , wrap.ExpressionStatement(wrap.CallExpression(
        wrap.Identifier('__continuation'),
        [wrap.Literal(null), contin()]))
  ])))
}


function transformExpressionStatement(exp, contin) {
  return dispatch(exp.expression, contin)
}

var gensym = (function () {
  var id = 0;
  return function gensym() {
    id++
    return wrap.Identifier('__val' + id)
  }
})()

function transformBinaryExpression(binexp, contin) {
  return convertLeft()
  function convertLeft() {
    if (!pred.isSimple(binexp.left)) {
      var val1 = gensym()
      exp = dispatch(binexp.left, convertRight.bind(null, [val1]))
      binexp.left = val1
      return exp
    }
    else return convertRight([])
  }
  function convertRight(sym) {
    if (!pred.isSimple(binexp.right)) {
      var val2 = gensym()
      exp = dispatch(binexp.right, convertMain.bind(null, [val2]))
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

function transformCallExpression(callExp, contin) {
  return convertCallee()
  function convertCallee() {
    if (!pred.isSimple(callExp.callee)) {
      var sym = gensym()
      exp = dispatch(callExp.callee, convertArg.bind(null, 0, [sym]))
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
      exp = dispatch(arg, convertArg.bind(null, i+1, [sym]))
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

function transformSimple(simp, contin) {
  return continuation(simp, contin())
}

function transformReturnStatement(retSt, contin) {
  // Doesn't call contin because when you get to a return theres nothing after...
  return retSt.argument == null ? wrapReturn(null, identity)
       : dispatch(retSt.argument, wrapReturn.bind(null, gensym()))

  function wrapReturn(val) {
    return wrap.FunctionExpression(wrap.BlockStatement([wrap.ExpressionStatement(wrap.CallExpression(wrap.Identifier('__return'), val == null ? null : [val]))]), [val])
  }
}

function transformFunctionExpression(func, contin) {
  func.params.push(wrap.Identifier('__return'))
  func.body.body.push(wrap.ReturnStatement(null))
  func.body = wrap.BlockStatement([wrap.ExpressionStatement(dispatch(func.body, defaultContin))])
  return continuation(func, contin())
}

transform = { Identifier: transformSimple
            , Program: transformProgram
            , BlockStatement: transformBlockStatement
            , ExpressionStatement: transformExpressionStatement
            , FunctionExpression: transformFunctionExpression
            , FunctionDeclaration: transformFunctionExpression
            , CallExpression: transformCallExpression
            , Literal: transformSimple
            , VariableDeclaration: transformVariableDeclaration
            , BinaryExpression: transformBinaryExpression
            , ReturnStatement: transformReturnStatement
            , dispatch: dispatch
            }

module.exports = transform
