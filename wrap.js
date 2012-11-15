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

function FunctionExpression(ast, params, id) {
  return { type: 'FunctionExpression', id: id || null, params: params || [], body: ast }
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

function VariableDeclaration(varDecs) {
  return { type: 'VariableDeclaration', declarations: varDecs || [], kind: 'var' }
}

function AssignmentExpression(left, right, op) {
  return { type: 'AssignmentExpression', operator: op, left: left, right: right }
}

function BinaryExpression(left, right, op) {
  return { type: 'BinaryExpression', left: left, right: right, operator: op }
}

function ReturnStatement(val) {
  return { type: 'ReturnStatement', argument: val }
}

function Literal(val) {
  return { type: 'Literal', value: val }
}

function UnaryExpression(op, val) {
  return { type: 'UnaryExpression', operator: op, argument: val }
}

function MemberExpression(obj, val) {
  return { type: 'MemberExpression', object: obj, property: val, isComputed: false }
}

function ObjectExpression(props) {
  return { type: 'ObjectExpression',  properties: props || [] }
}

function Property(key, val) {
  return { type: 'Property', kind: 'init', key: key, value: val }
}

function IfStatement(test, consq, alt) {
  return { type: 'IfStatement', test: test, consequent: consq, alternate: alt || null }
}

function UpdateExpression(op, arg, pre) {
  return { type: 'UpdateExpression', operator: op, argument: arg, prefix: pre || false }
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
                 , ReturnStatement: ReturnStatement
                 , EmptyStatement: { type: "EmptyStatement" }
                 , Literal: Literal
                 , UnaryExpression: UnaryExpression
                 , BinaryExpression: BinaryExpression
                 , MemberExpression: MemberExpression
                 , ObjectExpression: ObjectExpression
                 , Property: Property
                 , IfStatement: IfStatement
                 , UpdateExpression: UpdateExpression
                 , ThisExpression: { type: "ThisExpression" }
                 }

