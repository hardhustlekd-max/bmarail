const fs = require('fs');

function patchFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\{...props\}/g, '{...(props as any)}');
  // Actually let's explicitly remove key if it's there
  content = content.replace(/const finalHeight = .*/, '$&\n  const { key, ...restProps } = props as any;');
  content = content.replace(/\{...props\}/g, '{...restProps}');
  fs.writeFileSync(file, content);
}

patchFile('src/components/ui/Icon.tsx');
patchFile('src/components/SmartImage.tsx');
