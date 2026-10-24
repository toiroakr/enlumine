import ts from "typescript";

export function isolateHtmlTables(ast) {
  const statements=ast.statements;
  const firstLoop=statements.findIndex(ts.isForStatement);
  const start=statements[firstLoop-1];
  const endIndex=statements.findIndex(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(declaration=>
    declaration.initializer&&ts.isObjectLiteralExpression(declaration.initializer)&&
    ["char_cls","char_open","char_swap"].every(name=>declaration.initializer.properties.some(property=>property.name?.getText(ast)===name))));
  if(firstLoop<1||!ts.isVariableStatement(start)||endIndex<firstLoop)throw new Error("Missing pinned upstream HTML table initialization");
  const first=start.declarationList.declarations[0].initializer;
  if(!first||!ts.isCallExpression(first)||first.expression.getText(ast)!=="Array"||first.arguments.length!==1||first.arguments[0].getText(ast)!=="128")
    throw new Error("Unexpected pinned HTML escape table");
  const group=statements.slice(firstLoop-1,endIndex+1);
  if(group.filter(ts.isForStatement).length!==4||group.some(node=>!ts.isVariableStatement(node)&&!ts.isForStatement(node)&&!ts.isExpressionStatement(node)))
    throw new Error("Unexpected pinned HTML initialization statements");
  const names=group.filter(ts.isVariableStatement).flatMap(node=>node.declarationList.declarations.map(declaration=>{
    if(!ts.isIdentifier(declaration.name))throw new Error("Unexpected HTML table binding");
    return declaration.name.text;
  }));
  const from=start.getStart(ast),to=statements[endIndex].end;
  const original=ast.text.slice(from,to);
  const text=`var enlumineHtmlTables=/* @__PURE__ */(()=>{${original}\nreturn {${names.join(",")}};})();\nvar ${names.map(name=>`${name}=/* @__PURE__ */(()=>enlumineHtmlTables.${name})()`).join(",")};`;
  return {start:from,end:to,text};
}
