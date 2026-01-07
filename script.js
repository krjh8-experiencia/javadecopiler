let zipFiles = {};
let currentClassPath = null;
let editedSources = {}; // Para guardar ediciones futuras

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' }});
require(['vs/editor/editor.main'], function() {
  const editor = monaco.editor.create(document.getElementById('editor'), {
    value: '// Selecciona una clase del árbol para descompilarla y editarla',
    language: 'java',
    theme: 'vs-dark',
    automaticLayout: true
  });

  // Selector de descompilador
  const decompilerSelect = document.createElement('select');
  decompilerSelect.innerHTML = `
    <option value="CFR">CFR (rápido)</option>
    <option value="Vineflower" selected>Vineflower (mejor para plugins MC)</option>
    <option value="Procyon">Procyon</option>
  `;
  decompilerSelect.style.margin = '10px auto';
  decompilerSelect.style.display = 'block';
  document.querySelector('h1').after(decompilerSelect);

  document.getElementById('jarInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus('Cargando y descomprimiendo JAR...');
    const zip = await JSZip.loadAsync(file);
    zipFiles = zip.files;
    editedSources = {};

    // Construir árbol correctamente (soporta paquetes anidados profundos)
    const treeData = [{ text: 'Raíz', children: [], state: { opened: true } }];

    const root = treeData[0].children;

    for (const path in zip.files) {
      if (path.endsWith('.class') && !path.includes('META-INF/') && !path.startsWith('.')) {
        const parts = path.split('/');
        let current = root;

        // Crear paquetes anidados
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          let node = current.find(n => n.text === part && n.type === 'package');
          if (!node) {
            node = { text: part, children: [], type: 'package', icon: 'jstree-folder' };
            current.push(node);
          }
          current = node.children;
        }

        // Añadir la clase
        const className = parts[parts.length - 1];
        current.push({
          text: className,
          type: 'class',
          icon: 'jstree-file',
          path: path
        });
      }
    }

    $('#tree').jstree('destroy').empty();
    $('#tree').jstree({
      core: { data: treeData },
      plugins: ['types'],
      types: {
        'package': { icon: 'jstree-folder' },
        'class': { icon: 'jstree-file' }
      }
    });

    setStatus('¡Listo! Ahora expande las carpetas (como /com) y selecciona una clase.');

    // Al seleccionar una clase
    $('#tree').on('select_node.jstree', async (e, data) => {
      if (data.node.type === 'class') {
        currentClassPath = data.node.original.path;
        setStatus('Descompilando ' + data.node.text + '...');

        try {
          const classFile = zipFiles[currentClassPath];
          const arrayBuffer = await classFile.async('arraybuffer');

          const decompiler = decompilerSelect.value;
          let result;

          if (decompiler === 'CFR') {
            result = await org.katana.slicer.decompiler.CFR.decompile(arrayBuffer, currentClassPath.replace('.class', '').replace(/\//g, '.'));
          } else if (decompiler === 'Vineflower') {
            result = await org.katana.slicer.decompiler.Vineflower.decompile(arrayBuffer, currentClassPath.replace('.class', '').replace(/\//g, '.'));
          } else if (decompiler === 'Procyon') {
            result = await org.katana.slicer.decompiler.Procyon.decompile(arrayBuffer, currentClassPath.replace('.class', '').replace(/\//g, '.'));
          }

          const code = result || '// Error: No se pudo descompilar (posiblemente muy ofuscado)';
          editor.setValue(code);

          // Guardar fuente original para futuras ediciones
          if (!editedSources[currentClassPath]) {
            editedSources[currentClassPath] = code;
          }

          setStatus('Descompilado con ' + decompiler + '. ¡Puedes editar!');
        } catch (err) {
          editor.setValue('// Error grave: ' + (err.message || err));
          setStatus('Falló la descompilación. Prueba otro descompilador.');
          console.error(err);
        }
      }
    });
  });
});

function setStatus(msg) {
  document.getElementById('status').textContent = msg;
    }        
