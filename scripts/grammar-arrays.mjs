import ts from "typescript";

export function grammarArrays(ast, functions) {
  const initializers=new Map(),constants=new Set(),tokens=new Set();
  for(const node of ast.statements) {
    if(ts.isVariableStatement(node))for(const declaration of node.declarationList.declarations)
      if(ts.isIdentifier(declaration.name)&&declaration.initializer)initializers.set(declaration.name.text,declaration.initializer);
    if(ts.isImportDeclaration(node)&&node.moduleSpecifier.text.startsWith("@twinkleplop/core")) {
      const bindings=node.importClause?.namedBindings;
      if(bindings&&ts.isNamedImports(bindings))for(const item of bindings.elements)
        if(/^[A-Z][A-Z_]+$/.test(item.propertyName?.text??item.name.text))constants.add(item.name.text);
      if(bindings&&ts.isNamespaceImport(bindings)&&node.moduleSpecifier.text==="@twinkleplop/core/tokens")tokens.add(bindings.name.text);
    }
  }
  function value(node,seen=new Set()) {
    if(ts.isStringLiteral(node)||ts.isNumericLiteral(node)||[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(node.kind))return true;
    if(ts.isIdentifier(node)) {
      if(constants.has(node.text))return true;
      const initializer=initializers.get(node.text);
      if(!initializer||seen.has(node.text))return false;
      return value(initializer,new Set([...seen,node.text]));
    }
    if(ts.isPropertyAccessExpression(node)&&ts.isIdentifier(node.expression)&&tokens.has(node.expression.text))return true;
    if(ts.isArrayLiteralExpression(node))return node.elements.every(item=>value(ts.isSpreadElement(item)?item.expression:item,seen));
    if(ts.isObjectLiteralExpression(node))return node.properties.every(property=>ts.isPropertyAssignment(property)&&!ts.isComputedPropertyName(property.name)&&value(property.initializer,seen));
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&functions.has(node.expression.text))return node.arguments.every(argument=>value(argument,seen));
    return false;
  }
  return new Set([...initializers].filter(([,node])=>ts.isArrayLiteralExpression(node)&&node.elements.some(ts.isSpreadElement)&&value(node)).map(([name])=>name));
}
