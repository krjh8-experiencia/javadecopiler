let zipFiles = {};
let currentClassPath = null;
let editedSources = {};

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' }});
require(['vs/editor/editor.main'], function() {
  const editor = monaco.editor.create(document.getElementById('editor'), {
    value: '// Sube un .jar → expande carpetas → selecciona una clase para descompilar online',
    language: 'java',
    theme: 'vs-dark',
    automaticLayout: true
  });

  document.getElementById('jarInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus('Descomprimiendo JAR...');
    const zip = await JSZip.loadAsync(file);
    zipFiles = zip.files;
    editedSources = {};

    const treeData = [];
    const packages = {};

    for (const path in zipFiles) {
      if (path.endsWith('.class') && !path.includes('META-INF/')) {
        const parts = path.split('/');
        let current = packages;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!current[part]) current[part] = {};
          current = current[part];
        }
        current[parts[parts.length - 1]] = path;
      }
    }

    function buildTree(obj, name) {
      const children = [];
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          children.push({ text: key, type: 'class', path: obj[key], icon: 'jstree-file' });
        } else {
          children.push(buildTree(obj[key], key));
        }
      }
      return { text: name, children: children.length ? children : false, type: 'package', icon: 'jstree-folder' };
    }

    for (const pkg in packages) {
      treeData.push(buildTree(packages[pkg], pkg));
    }

    if (treeData.length === 0) treeData.push({ text: 'No clases encontradas', disabled: true });

    $('#tree').jstree('destroy');
    $('#tree').jstree({
      core: { data: treeData },
      plugins: ['wholerow', 'types'],
      types: { package: { icon: 'jstree-folder' }, class: { icon: 'jstree-file' } }
    });

    // Click en carpeta → expandir
    $('#tree').on('select_node.jstree', (e, data) => {
      if (data.node.type === 'package') $('#tree').jstree('toggle_node', data.node);
    });

    // Click en clase → descompilar con javadecompilers.com
    $('#tree').on('activate_node.jstree', async (e, data) => {
      if (data.node.type !== 'class') return;
      currentClassPath = data.node.original.path;
      setStatus('Subiendo clase a decompiler online y obteniendo código... (unos segundos)');

      try {
        const classFile = zipFiles[currentClassPath];
        const blob = await classFile.async('blob');

        const formData = new FormData();
        formData.append('file', blob, data.node.text); // Nombre del .class

        const response = await fetch('http://www.javadecompilers.com/apiv2/decompile', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) throw new Error('Error del servidor: ' + response.status);

        const result = await response.json();
        const code = result.decompiled || '// No se pudo descompilar (quizás ofuscado)';
        editor.setValue(code);
        editedSources[currentClassPath] = code;
        setStatus('¡Descompilado con éxito! Puedes editar el código aquí.');
      } catch (err) {
        editor.setValue('// Error: ' + err.message + '\n// Prueba con otro plugin o clase no ofuscada');
        setStatus('Falló la descompilación online. Puede ser temporal o por ofuscación.');
        console.error(err);
      }
    });

    setStatus('¡JAR cargado! Haz click en carpetas para expandir y selecciona una clase.');
  });
});

function setStatus(msg) {
  document.getElementById('status').innerHTML = '<strong>' + msg + '</strong>';
}
