let zipFiles = {};
let jarBlob = null;

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' }});
require(['vs/editor/editor.main'], function() {
  const editor = monaco.editor.create(document.getElementById('editor'), {
    value: '// Sube un .jar → verás el árbol de clases → usa el botón para decompilar online en decompiler.com (el mejor sitio actual)',
    language: 'java',
    theme: 'vs-dark',
    automaticLayout: true
  });

  document.getElementById('jarInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    jarBlob = file;
    setStatus('Descomprimiendo JAR para mostrar árbol...');

    const zip = await JSZip.loadAsync(file);
    zipFiles = zip.files;

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
          children.push({ text: key, type: 'class', icon: 'jstree-file' });
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

    // Expandir carpetas con click
    $('#tree').on('select_node.jstree', (e, data) => {
      if (data.node.type === 'package') $('#tree').jstree('toggle_node', data.node);
    });

    // Mostrar mensaje con botón
    editor.setValue('// Árbol cargado. Usa el botón abajo para decompilar todo el JAR online.');

    // Crear botón para abrir en decompiler.com
    const button = document.createElement('button');
    button.textContent = 'Decompilar JAR completo en decompiler.com (recomendado)';
    button.style.cssText = 'margin: 20px auto; display: block; padding: 15px; font-size: 18px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer;';
    button.onclick = () => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        window.open('https://www.decompiler.com/#data:' + encodeURIComponent(dataUrl), '_blank');
      };
      reader.readAsDataURL(jarBlob);
    };

    document.getElementById('status').innerHTML = '';
    document.getElementById('status').appendChild(button);

    setStatus('¡Árbol listo! Haz click en carpetas para expandir (como "com"). Luego usa el botón verde para decompilar todo.');
  });
});

function setStatus(msg) {
  // El botón reemplaza esto, pero por si acaso
  if (!document.querySelector('button')) {
    document.getElementById('status').innerHTML = '<strong>' + msg + '</strong>';
  }
}
