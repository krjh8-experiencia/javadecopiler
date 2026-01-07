let zipFiles = {};
let currentClassPath = null;
let editedSources = {};

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' }});
require(['vs/editor/editor.main'], function() {
  const editor = monaco.editor.create(document.getElementById('editor'), {
    value: '// Expande las carpetas (como com) con un click y selecciona una clase para descompilarla',
    language: 'java',
    theme: 'vs-dark',
    automaticLayout: true
  });

  // Selector de descompilador
  const decompilerSelect = document.createElement('select');
  decompilerSelect.innerHTML = `
    <option value="CFR">CFR</option>
    <option value="Vineflower" selected>Vineflower (recomendado para plugins)</option>
    <option value="Procyon">Procyon</option>
  `;
  decompilerSelect.style.margin = '15px auto';
  decompilerSelect.style.display = 'block';
  decompilerSelect.style.padding = '8px';
  decompilerSelect.style.fontSize = '16px';
  document.querySelector('h1').after(decompilerSelect);

  document.getElementById('jarInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus('Descomprimiendo JAR...');
    const zip = await JSZip.loadAsync(file);
    zipFiles = zip.files;
    editedSources = {};

    const rootNode = { text: 'JAR contenido', children: [], state: { opened: true } };
    const rootChildren = rootNode.children;

    // Recorrer todos los .class
    for (const path in zip.files) {
      if (path.endsWith('.class') && !path.includes('META-INF/') && !path.startsWith('.')) {
        const parts = path.split('/');
        let currentLevel = rootChildren;

        // Crear estructura de paquetes
        for (let i = 0; i < parts.length - 1; i++) {
          const folderName = parts[i];
          let folderNode = currentLevel.find(n => n.text === folderName && n.type === 'package');

          if (!folderNode) {
            folderNode = {
              text: folderName,
              children: [],
              type: 'package',
              icon: 'jstree-folder',
              state: { opened: false }
            };
            currentLevel.push(folderNode);
          }
          currentLevel = folderNode.children;
        }

        // Añadir la clase
        const className = parts[parts.length - 1];
        currentLevel.push({
          text: className,
          type: 'class',
          icon: 'jstree-file',
          path: path
        });
      }
    }

    // Destruir y recrear el árbol
    $('#tree').jstree('destroy').empty();
    $('#tree').jstree({
      core: {
        data: [rootNode],
        check_callback: true
      },
      plugins: ['types', 'wholerow'],
      types: {
        'package': { icon: 'jstree-folder' },
        'class': { icon: 'jstree-file' }
      }
    });

    // ¡Importante! Un solo click expande carpetas
    $('#tree').on('select_node.jstree', (e, data) => {
      $('#tree').jstree('toggle_node', data.node);
    });

    // Doble funcionalidad: si es clase → descompila
    $('#tree').on('activate_node.jstree', async (e, data) => {
      if (data.node.type === 'class') {
        currentClassPath = data.node.original.path;
        setStatus('Descompilando ' + data.node.text + '...');

        try {
          const classFile = zipFiles[currentClassPath];
          const arrayBuffer = await classFile.async('arraybuffer');
          const className = currentClassPath.replace('.class', '').replace(/\//g, '.');

          let result;
          const decompiler = decompilerSelect.value;

          if (decompiler === 'CFR') {
            result = await org.katana.slicer.decompiler.CFR.decompile(arrayBuffer, className);
          } else if (decompiler === 'Vineflower') {
            result = await org.katana.slicer.decompiler.Vineflower.decompile(arrayBuffer, className);
          } else if (decompiler === 'Procyon') {
            result = await org.katana.slicer.decompiler.Procyon.decompile(arrayBuffer, className);
          }

          const code = result || '// No se pudo descompilar correctamente (quizás muy ofuscado)';
          editor.setValue(code);
          editedSources[currentClassPath] = code;

          setStatus('Descompilado con ' + decompiler + '. ¡Edita lo que quieras!');
        } catch (err) {
          editor.setValue('// Error: ' + (err.message || err));
          setStatus('Error al descompilar. Prueba otro descompilador.');
          console.error(err);
        }
      }
    });

    setStatus('¡Listo! Haz click en las carpetas para expandirlas (com → tu → plugin → clases)');
  });
});

function setStatus(msg) {
  document.getElementById('status').innerHTML = '<strong>' + msg + '</strong>';
}
