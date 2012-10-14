function bodyBlockType(type) {
  return function wrapBody(ast) {
    if (arguments.length > 1) ast = Array.prototype.slice.call(arguments)
    return { type: type, body: Array.isArray(ast) ? ast : [ast] }
  }
}
var Program = bodyBlockType('Program')
var BlockStatement = bodyBlockType('BlockStatement')

function ExpressionStatement(ast) {
  if (ast.type === 'ExpressionStatement') return ast
  return { type: 'ExpressionStatement', expression: ast }
}

function FunctionExpression(ast, params) {
  return { type: 'FunctionExpression', id: null, params: params || [], body: ast }
}

function CallExpression(ast, args) {
  return { type: 'CallExpression', callee: ast, arguments: args || [] }
}

function SequenceExpression(ast) {
  return { type: 'SequenceExpression',  expressions: ast }
}

function Identifier(name) {
  return { type: 'Identifier',  name: name }
}

function VariableDeclarator(id, init) {
  return { type: 'VariableDeclarator', id: id, init: init }
}

function VariableDeclaration(id, init) {
  return { type: 'VariableDeclaration', declarations: [VariableDeclarator(id, init)], kind: 'var' }
}

function AssignmentExpression(left, right, op) {
  return { type: 'AssignmentExpression', operator: op, left: left, right: right }
}

module.exports = { ExpressionStatement: ExpressionStatement
                 , Program: Program
                 , BlockStatement: BlockStatement
                 , FunctionExpression: FunctionExpression
                 , CallExpression: CallExpression
                 , SequenceExpression: SequenceExpression
                 , Identifier: Identifier
                 , VariableDeclarator: VariableDeclarator
                 , VariableDeclaration: VariableDeclaration
                 , AssignmentExpression: AssignmentExpression
                 , EmptyStatement: { type: "EmptyStatement" }
                 }

