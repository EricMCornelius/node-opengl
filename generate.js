#!/usr/bin/env node

var fs = require('fs');
var _ = require('lodash');

var input = './' + (process.argv[2] || 'opengl.json');
var info = require(input);

var headerfile = fs.createWriteStream('src/opengl.h');
var sourcefile = fs.createWriteStream('src/opengl.cc');

var failed_functions = {};

function getType(t) {
  if (t.pointer) {
    return getType(t.type) + '*';
  }
  if (t.rvalue_reference || t.lvalue_reference) {
    return 'complex';
  }
  if (t.type) {
    return getType(t.type);
  }
  return t;
}

function generateArgAccessor(f, a, idx) {
  var t = getType(a);
  var template = (t.indexOf('*') !== -1) ? `  auto _${a.name} = ` : `  auto ${a.name} = `;

  var rhs = 'args[' + idx + ']';
  switch (t) {
    case 'unsigned int':
    case 'unsigned short':
    case 'unsigned char':
      rhs += '->Uint32Value();';
      break;
    case 'long':
      rhs += '->IntegerValue();';
      break;
    case 'unsigned long':
      rhs += '->IntegerValue();';
      break;
    case 'int':
    case 'short':
    case 'char':
    case 'signed char':
      rhs += '->Int32Value();';
      break;
    case 'bool':
      rhs += '->BooleanValue();';
      break;
    case 'double':
    case 'float':
      rhs += '->NumberValue();';
      break;
    case 'char*':
      template = `NanAsciiString _${a.name}(args[${idx}]->ToString());`;
      rhs = `  auto ${a.name} = *_${a.name};`;
      break;
    case 'void*':
    case 'long*':
    case 'unsigned long*':
    case 'int*':
    case 'unsigned int*':
    case 'short*':
    case 'unsigned short*':
    case 'float*':
    case 'double*':
    case 'unsigned char*':
    case 'signed char*':
      rhs += '->ToObject();\n';
      rhs += `  auto ${a.name} = reinterpret_cast<${t}>(node::Buffer::Data(_${a.name}));`;
      // node::Buffer::HasInstance(val))
      // node::Buffer::Data(val);
      // node::Buffer::Length(val);
      break;
    default: {
      rhs += '???' + t + '???';
    }
  }
  var res = template + rhs;
  if (res.indexOf('???') !== -1) {
    console.error(`Accessor generation error: ${f.name}|${a.name}|${res.trim()}`);
    failed_functions[f.name] = true;
    return '';
  }
  return template + rhs;
}

function generateInvocation(f) {
  if (failed_functions[f.name]) {
    return '';
  }

  var template = '  ';
  var t = getType(f.result);
  if (t !== 'void') {
    template += 'auto res = ';
  }
  template += `${f.name}(${f.args.map(function(arg){return arg.name}).join(', ')});`;
  return template;
}

function generateReturn(f) {
  var template = '  ';
  var t = getType(f.result);
  switch(t) {
    case 'unsigned int':
    case 'unsigned short':
    case 'unsigned char':
    case 'long':
    case 'unsigned long':
    case 'int':
    case 'short':
    case 'char':
      template += 'NanReturnValue(NanNew<Number>(res));'
      break;
    case 'void':
      template += 'NanReturnNull();';
      break;
    case 'unsigned char*':
    case 'signed char*':
    case 'char*':
      template += 'NanReturnValue(NanNew<String>(res));';
      break;
    default: {
      template += '???' + t + '???';
    }
  }

  if (template.indexOf('???') !== -1) {
    console.error(`Result generation error: ${f.name}|${template.trim()}`);
    failed_functions[f.name] = true;
    return '';
  }
  return template;
}

function generateMethod(f) {
  var template = [];
  template.push(`
NAN_METHOD(${f.name}_binding) {`);
  template.push(`  NanScope();`);
  template.push('');
  var generator = _.partial(generateArgAccessor, f);
  template = template.concat(f.args.map(generator));
  template.push(generateInvocation(f));
  template.push(generateReturn(f));
  template.push('}');

  if (failed_functions[f.name]) {
    return `//TODO: fix ${f.name}`;
  }

  return template.join('\n');
}

function generateExport(f) {
  if (failed_functions[f.name]) {
    return `//TODO: fix ${f.name}`;
  }

  var template = `
  exports->Set(NanNew<String>("${f.name}"),
    NanNew<FunctionTemplate>(${f.name}_binding)->GetFunction());`;
  return template;
}

function generatePrototype(f) {
  if (failed_functions[f.name]) {
    return `//TODO: fix ${f.name}`;
  }

  return `NAN_METHOD(${f.name}_binding);`;
}

function generateBinding(info) {
  var methods = info.functions.map(generateMethod).join('\n');
  var exports = info.functions.map(generateExport).join('\n');
  var src_template = fs.readFileSync('./opengl.cc.tmpl').toString();
  var res = src_template
    .replace('${methods}', methods)
    .replace('${exports}', exports);
  sourcefile.write(res);

  var prototypes = info.functions.map(generatePrototype).join('\n');
  var header_template = fs.readFileSync('./opengl.h.tmpl').toString();
  var res = header_template
    .replace('${prototypes}', prototypes);
  headerfile.write(res);
}

generateBinding(info);
