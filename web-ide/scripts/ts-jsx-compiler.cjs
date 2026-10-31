/**
 * APK STUDIO — Self-Contained AST-Powered TypeScript & JSX Compiler
 * Uses bundled @babel/parser (zero external dependencies) to parse TypeScript & JSX
 * into an exact AST, transform JSX/TS/ESM into CommonJS, and validate syntax via `vm.Script`.
 */
const vm = require('vm');
const parser = require('./vendor/babel-parser.cjs');

function compileTsxToCommonJs(sourceCode, filename = 'module.tsx') {
  const ast = parser.parse(sourceCode, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx']
  });

  // Collect character range replacements: { start, end, text }
  // For nested AST nodes, we recursively render ranges.
  function printSlice(start, end) {
    const edits = collectEditsInRange(ast.program, start, end);
    edits.sort((a, b) => a.start - b.start);
    let out = '';
    let cursor = start;
    for (const edit of edits) {
      if (edit.start < cursor) continue;
      out += sourceCode.slice(cursor, edit.start) + edit.text;
      cursor = edit.end;
    }
    out += sourceCode.slice(cursor, end);
    return out;
  }

  function renderJsxAttributeValue(valNode) {
    if (!valNode) return 'true';
    if (valNode.type === 'StringLiteral') {
      return JSON.stringify(valNode.value);
    }
    if (valNode.type === 'JSXExpressionContainer') {
      return printNode(valNode.expression);
    }
    return printNode(valNode);
  }

  function renderJsxChildren(children) {
    const out = [];
    for (const child of children) {
      if (child.type === 'JSXText') {
        // Normalize JSX whitespace following React rules
        const lines = child.value.split(/\r?\n/);
        const cleanedLines = lines.map((line, idx) => {
          let s = line.replace(/\t/g, ' ');
          if (idx > 0) s = s.replace(/^[ ]+/, '');
          if (idx < lines.length - 1) s = s.replace(/[ ]+$/, '');
          return s;
        }).filter((s) => s.length > 0);
        if (cleanedLines.length > 0) {
          out.push(JSON.stringify(cleanedLines.join(' ')));
        }
      } else if (child.type === 'JSXExpressionContainer') {
        if (child.expression.type !== 'JSXEmptyExpression') {
          out.push(printNode(child.expression));
        }
      } else if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
        out.push(printNode(child));
      } else {
        out.push(printNode(child));
      }
    }
    return out;
  }

  function renderJsxOpeningName(nameNode) {
    if (nameNode.type === 'JSXIdentifier') {
      const name = nameNode.name;
      if (/^[a-z]/.test(name)) {
        return JSON.stringify(name);
      }
      return name;
    }
    if (nameNode.type === 'JSXMemberExpression') {
      return `${renderJsxOpeningName(nameNode.object)}.${nameNode.property.name}`;
    }
    return printSlice(nameNode.start, nameNode.end);
  }

  function renderJsxElement(node) {
    const opening = node.openingElement;
    const tagExpr = renderJsxOpeningName(opening.name);
    const attrs = opening.attributes || [];
    let propsExpr = 'null';

    if (attrs.length > 0) {
      const segments = [];
      let currentObjProps = [];
      const flushObj = () => {
        if (currentObjProps.length > 0) {
          segments.push(`{ ${currentObjProps.join(', ')} }`);
          currentObjProps = [];
        }
      };
      for (const attr of attrs) {
        if (attr.type === 'JSXSpreadAttribute') {
          flushObj();
          segments.push(printNode(attr.argument));
        } else if (attr.type === 'JSXAttribute') {
          const propName = attr.name.type === 'JSXIdentifier'
            ? JSON.stringify(attr.name.name)
            : JSON.stringify(`${attr.name.namespace.name}:${attr.name.name.name}`);
          const propVal = renderJsxAttributeValue(attr.value);
          currentObjProps.push(`${propName}: ${propVal}`);
        }
      }
      flushObj();
      propsExpr = segments.length === 1 ? segments[0] : `Object.assign({}, ${segments.join(', ')})`;
    }

    const childrenExprs = renderJsxChildren(node.children || []);
    const allArgs = [tagExpr, propsExpr, ...childrenExprs];
    return `React.createElement(${allArgs.join(', ')})`;
  }

  function renderJsxFragment(node) {
    const childrenExprs = renderJsxChildren(node.children || []);
    const allArgs = ['React.Fragment', 'null', ...childrenExprs];
    return `React.createElement(${allArgs.join(', ')})`;
  }

  function printNode(node) {
    return printSlice(node.start, node.end);
  }

  function collectEditsInRange(rootNode, rangeStart, rangeEnd) {
    const edits = [];

    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (typeof node.start === 'number' && typeof node.end === 'number') {
        if (node.end <= rangeStart || node.start >= rangeEnd) return;
      }

      // 1. Pure TypeScript declarations -> erase completely
      if (
        node.type === 'TSInterfaceDeclaration' ||
        node.type === 'TSTypeAliasDeclaration' ||
        node.type === 'TSDeclareFunction' ||
        node.type === 'TSDeclareMethod' ||
        node.type === 'TSIndexSignature'
      ) {
        if (node.start >= rangeStart && node.end <= rangeEnd) {
          edits.push({ start: node.start, end: node.end, text: '' });
          return;
        }
      }

      // 2. Type annotations & generic type parameters -> erase completely
      if (
        node.type === 'TSTypeAnnotation' ||
        node.type === 'TSTypeParameterDeclaration' ||
        node.type === 'TSTypeParameterInstantiation'
      ) {
        if (node.start >= rangeStart && node.end <= rangeEnd) {
          edits.push({ start: node.start, end: node.end, text: '' });
          return;
        }
      }

      // 2b. Optional parameter/property question mark (`param?: Type` or `param?`)
      if (node.optional && node.type === "Identifier") {
        const endPos = node.typeAnnotation ? node.typeAnnotation.start : node.end;
        const nameEnd = node.start + node.name.length;
        if (nameEnd >= rangeStart && endPos <= rangeEnd && endPos > nameEnd) {
          edits.push({ start: nameEnd, end: endPos, text: "" });
        }
      }

      // 3. `expr as Type` / `expr!` / `<Type>expr` -> keep inner expression only
      if (
        node.type === 'TSAsExpression' ||
        node.type === 'TSTypeAssertion' ||
        node.type === 'TSNonNullExpression' ||
        node.type === 'TSSatisfiesExpression'
      ) {
        if (node.start >= rangeStart && node.end <= rangeEnd) {
          edits.push({ start: node.start, end: node.end, text: printNode(node.expression) });
          return;
        }
      }

      // 4. ClassMethod / ClassProperty accessibility & abstract/override/readonly modifiers
      if ((node.type === 'ClassMethod' || node.type === 'ClassProperty') && node.accessibility) {
        const headerSlice = sourceCode.slice(node.start, node.key.start);
        const cleanedHeader = headerSlice.replace(/\b(public|private|protected|readonly|override)\s+/g, '');
        if (cleanedHeader !== headerSlice && node.start >= rangeStart && node.key.start <= rangeEnd) {
          edits.push({ start: node.start, end: node.key.start, text: cleanedHeader });
        }
      }

      // 5. JSXElement & JSXFragment
      if (node.type === 'JSXElement') {
        if (node.start >= rangeStart && node.end <= rangeEnd) {
          edits.push({ start: node.start, end: node.end, text: renderJsxElement(node) });
          return;
        }
      }
      if (node.type === 'JSXFragment') {
        if (node.start >= rangeStart && node.end <= rangeEnd) {
          edits.push({ start: node.start, end: node.end, text: renderJsxFragment(node) });
          return;
        }
      }

      // 6. ImportDeclaration
      if (node.type === 'ImportDeclaration') {
        if (node.start >= rangeStart && node.end <= rangeEnd) {
          if (node.importKind === 'type') {
            edits.push({ start: node.start, end: node.end, text: '' });
            return;
          }
          const src = JSON.stringify(node.source.value);
          const specs = (node.specifiers || []).filter((s) => s.importKind !== 'type');
          if (specs.length === 0) {
            if ((node.specifiers || []).length > 0) {
              // All specifiers were `import { type X } from ...`
              edits.push({ start: node.start, end: node.end, text: '' });
            } else {
              edits.push({ start: node.start, end: node.end, text: `require(${src});` });
            }
            return;
          }
          const stmts = [];
          const namedSpecs = [];
          for (const sp of specs) {
            if (sp.type === 'ImportDefaultSpecifier') {
              const local = sp.local.name;
              stmts.push(`const ${local} = (() => { const _m = require(${src}); return _m && _m.__esModule && _m.default !== undefined ? _m.default : _m; })();`);
            } else if (sp.type === 'ImportNamespaceSpecifier') {
              const local = sp.local.name;
              stmts.push(`const ${local} = require(${src});`);
            } else if (sp.type === 'ImportSpecifier') {
              const impName = sp.imported.type === 'Identifier' ? sp.imported.name : sp.imported.value;
              const localName = sp.local.name;
              namedSpecs.push(impName === localName ? impName : `${impName}: ${localName}`);
            }
          }
          if (namedSpecs.length > 0) {
            stmts.push(`const { ${namedSpecs.join(', ')} } = require(${src});`);
          }
          edits.push({ start: node.start, end: node.end, text: stmts.join(' ') });
          return;
        }
      }

      // 7. ExportNamedDeclaration
      if (node.type === 'ExportNamedDeclaration') {
        if (node.start >= rangeStart && node.end <= rangeEnd) {
          if (node.exportKind === 'type') {
            edits.push({ start: node.start, end: node.end, text: '' });
            return;
          }
          if (node.declaration) {
            const decl = node.declaration;
            if (
              decl.type === 'TSInterfaceDeclaration' ||
              decl.type === 'TSTypeAliasDeclaration'
            ) {
              edits.push({ start: node.start, end: node.end, text: '' });
              return;
            }
            const declCode = printNode(decl);
            const exportedNames = [];
            if (decl.type === 'VariableDeclaration') {
              for (const d of decl.declarations) {
                if (d.id.type === 'Identifier') exportedNames.push(d.id.name);
              }
            } else if (
              (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') &&
              decl.id
            ) {
              exportedNames.push(decl.id.name);
            }
            const assignCode = exportedNames.map((n) => `exports.${n} = ${n};`).join(' ');
            edits.push({ start: node.start, end: node.end, text: `${declCode}\n${assignCode}` });
            return;
          }
          const valueSpecs = (node.specifiers || []).filter((s) => s.exportKind !== 'type');
          if (valueSpecs.length === 0) {
            edits.push({ start: node.start, end: node.end, text: '' });
            return;
          }
          if (node.source) {
            const src = JSON.stringify(node.source.value);
            const lines = [`const _reexp = require(${src});`];
            for (const sp of valueSpecs) {
              const localName = sp.local.name;
              const expName = sp.exported.type === 'Identifier' ? sp.exported.name : sp.exported.value;
              lines.push(`exports.${expName} = _reexp.${localName};`);
            }
            edits.push({ start: node.start, end: node.end, text: lines.join(' ') });
            return;
          }
          const lines = valueSpecs.map((sp) => {
            const localName = sp.local.name;
            const expName = sp.exported.type === 'Identifier' ? sp.exported.name : sp.exported.value;
            return `exports.${expName} = ${localName};`;
          });
          edits.push({ start: node.start, end: node.end, text: lines.join(' ') });
          return;
        }
      }

      // 8. ExportDefaultDeclaration
      if (node.type === 'ExportDefaultDeclaration') {
        if (node.start >= rangeStart && node.end <= rangeEnd) {
          const decl = node.declaration;
          if (
            (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') &&
            decl.id
          ) {
            const declCode = printNode(decl);
            edits.push({
              start: node.start,
              end: node.end,
              text: `${declCode}\nexports.default = ${decl.id.name};`
            });
          } else {
            edits.push({
              start: node.start,
              end: node.end,
              text: `exports.default = ${printNode(decl)};`
            });
          }
          return;
        }
      }

      // Recurse into child AST properties
      for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'comments' || key === 'leadingComments' || key === 'trailingComments') continue;
        const child = node[key];
        if (Array.isArray(child)) {
          for (const item of child) visit(item);
        } else if (child && typeof child === 'object' && typeof child.type === 'string') {
          visit(child);
        }
      }
    }

    visit(rootNode);
    return edits;
  }

  const bodyOutput = printSlice(0, sourceCode.length);
  const finalCode = `"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\n${bodyOutput}\n`;

  // Strictly verify that the generated code is 100% syntactically valid JavaScript
  new vm.Script(finalCode, { filename });

  return finalCode;
}

module.exports = { compileTsxToCommonJs };
