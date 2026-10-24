import ts from "typescript";

export function pureInitializers(ast) {
  const numbers = new Map();
  const objects = new Set();
  const constructors = new Set();
  const assigned = new Set();
  const edits = [];
  function writes(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment && ts.isIdentifier(node.left)) assigned.add(node.left.text);
    if ((ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)) && ts.isIdentifier(node.operand) &&
        [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) assigned.add(node.operand.text);
    ts.forEachChild(node, writes);
  }
  writes(ast);
  function numeric(node, seen = new Set()) {
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (ts.isIdentifier(node) && !seen.has(node.text) && numbers.has(node.text))
      return numeric(numbers.get(node.text), new Set([...seen, node.text]));
    if (!ts.isBinaryExpression(node)) return;
    const left = numeric(node.left, seen), right = numeric(node.right, seen);
    if (left === undefined || right === undefined) return;
    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.AsteriskToken: return left * right;
      case ts.SyntaxKind.PlusToken: return left + right;
      case ts.SyntaxKind.MinusToken: return left - right;
      case ts.SyntaxKind.LessThanLessThanToken: return left << right;
      case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken: return left >>> right;
    }
  }
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const node = declaration.initializer;
      if (!node || !ts.isIdentifier(declaration.name)) continue;
      const name = declaration.name.text;
      if (!assigned.has(name) && numeric(node) !== undefined) numbers.set(name, node);
      if (ts.isObjectLiteralExpression(node) && node.properties.every(property =>
        ts.isPropertyAssignment(property) && !ts.isComputedPropertyName(property.name) &&
        ts.isStringLiteral(property.initializer)) && !assigned.has(name)) objects.add(name);
      if (ts.isClassExpression(node) && !node.heritageClauses) {
        const constructor = node.members.find(ts.isConstructorDeclaration);
        const parameter = constructor?.parameters[0]?.name;
        if (parameter && ts.isIdentifier(parameter) && node.members.every(member =>
          ts.isConstructorDeclaration(member) || ts.isMethodDeclaration(member) && !ts.isComputedPropertyName(member.name))) {
          const text = constructor.getText(ast).replace(/\s/g, "");
          const p = parameter.text;
          if (text === `constructor(${p}=1024){this.count=0,this.capacity=${p},this.token_idx=newInt32Array(${p}),this.type_id=newInt32Array(${p}),this.precedence=newInt32Array(${p});}`)
            if (!assigned.has(name)) constructors.add(name);
        }
      }
      const allocation = ts.isNewExpression(node) && ts.isIdentifier(node.expression) &&
        (constructors.has(node.expression.text) && !node.arguments?.length ||
          ["Uint8Array", "Uint16Array", "Uint32Array", "Int32Array"].includes(node.expression.text) &&
          node.arguments?.every(argument => {
            const length = numeric(argument);
            return Number.isFinite(length) && length >= 0 && length <= 1048576;
          }));
      const keys = ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(ast) === "Object" && node.expression.name.text === "keys" &&
        node.arguments.length === 1 && ts.isIdentifier(node.arguments[0]) && objects.has(node.arguments[0].text);
      if (allocation || keys) edits.push({start: node.getStart(ast), end: node.end,
        text: `/* @__PURE__ */ (() => (${node.getText(ast)}))()`});
    }
  }
  return edits;
}
