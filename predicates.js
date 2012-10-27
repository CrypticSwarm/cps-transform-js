// Predicates

function isFunction(node) {
  return node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration'
}

function isScoped(node) {
  return node.type === 'VariableDeclaration' || node.type === 'FunctionDeclaration'
}

function isBlock(node) {
  return node.type === 'Program' || node.type === 'BlockStatement'
}

function isSimple(node) {
  return node.type === 'Literal' || node.type === 'Identifier'
}

function isIdentifier(node) {
  return node.type === 'Identifier'
}

module.exports = { isSimple: isSimple
                 , isBlock: isBlock
                 , isScoped: isScoped
                 , isFunction: isFunction
                 , isIdentifier: isIdentifier
                 }
