let zipFiles = {};
let currentClassPath = null;

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' }});
require(['vs/editor/editor.main'], function() {
  const editor = monaco.editor.create(document.getElementById('editor'), {
    value: '// Selecciona una clase del árbol para ver su código descompilado',
    language: 'java',
    theme: 'vs-dark',
    automaticLayout: true
  });

  document.getElementById('jarInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus('Cargando y descomprimiendo JAR...');
    const zip = await JSZip.loadAsync(file);
    zipFiles = zip.files;

    const treeData = [];

    // Construir árbol de paquetes
    const packages = {};

    for (const path in zip.files) {
      if (path.endsWith('.class') && !path.includes('META-INF')) {
        const parts = path.split('/');
        let current = packages;

        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!current[part]) current[part] = {};
          current = current[part];
        }
        const className = parts[parts.length - 1];
        current[className] = path;
      }
    }

    function buildNode(obj, name) {
      const children = [];
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          children.push({ text: key, type: 'class', path: obj[key] });
        } else {
          children.push(buildNode(obj[key], key));
        }
      }
      return { text: name, children: children.length > 0 ? children : undefined, type: 'package' };
    }

    if (Object.keys(packages).length > 0) {
      for (const pkg in packages) {
        treeData.push(buildNode(packages[pkg], pkg));
      }
    }

    $('#tree').jstree('destroy').empty();
    $('#tree').jstree({
      core: { data: treeData.length > 0 ? treeData : [{ text: 'No se encontraron clases', state: { disabled: true } }] },
      plugins: ['types'],
      types: {
        'package': { icon: 'jstree-folder' },
        'class': { icon: 'jstree-file' }
      }
    });

    setStatus(`¡Listo! ${Object.keys(zip.files).filter(f => f.endsWith('.class')).length} clases encontradas.`);

    // Evento al seleccionar una clase
    $('#tree').on('select_node.jstree', async (e, data) => {
      if (data.node.type === 'class') {
        currentClassPath = data.node.original.path;
        setStatus('Descompilando ' + data.node.text + '...');

        try {
          const classFile = zipFiles[currentClassPath];
          const arrayBuffer = await classFile.async('arraybuffer');

          // Usar Slicer (CFR) para descompilar
          const result = await org.katana.slicer.decompiler.CFR.decompile(
            arrayBuffer,
            currentClassPath.replace('.class', '').replace(/\//g, '.')
          );

          editor.setValue(result || '// Error al descompilar (puede estar ofuscado)');
          setStatus('Descompilado con éxito. Puedes editar el código.');
        } catch (err) {
          editor.setValue('// Error: ' + (err.message || err));
          setStatus('Error al descompilar esta clase.');
          console.error(err);
        }
      }
    });
  });
});

function setStatus(msg) {
  document.getElementById('status').textContent = msg;
}
