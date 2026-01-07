let zipFiles = {};
let currentClassPath = null;
let editedSources = {};

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' }});
require(['vs/editor/editor.main'], function() {
  const editor = monaco.editor.create(document.getElementById('editor'), {
    value: '// Haz click en cualquier carpeta (como "com") para expandirla → luego selecciona una clase',
    language: 'java',
    theme: 'vs-dark',
    automaticLayout: true
  });

  // Selector de descompilador
  const decompilerSelect = document.createElement('select');
  decompilerSelect.innerHTML = `
    <option value="CFR">CFR</option>
    <option value="Vineflower" selected>Vineflower (mejor para plugins Minecraft)</option>
    <option value="Procyon">Procyon</option>
  `;
  decompilerSelect.style.cssText = 'margin: 15px auto; display: block; padding: 10px; font-size: 16px; border-radius: 8px;';
  document.querySelector('h1').after(decompilerSelect);

  document.getElementById('jarInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus('Descomprimiendo el JAR...');
    const zip = await JSZip.loadAsync(file);
    zipFiles = zip.files;
    editedSources = {};

    // Estructura del árbol
    const treeData = [];

    const packages = {}; // Para construir jerarquía

    // Recopilar todos los paths de .class
    for (const path in zipFiles) {
      if (path.endsWith('.class') && !path.includes('META-INF/') && !path.startsWith('.')) {
        const parts = path.split('/');
        let current = packages;

        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!current[part]) current[part] = { '__isPackage': true, '__children': {} };
          current = current[part].__children;
        }
        const className = parts[parts.length - 1];
        current[className] = path;
      }
    }

    // Función recursiva para convertir a formato jsTree
    function buildTree(obj, name) {
      const children = [];
      for (const key in obj) {
        if (key === '__isPackage') continue;
        if (typeof obj[key] === 'string') {
          // Es una clase
          children.push({
            text: key,
            type: 'class',
            path: obj[key],
            icon: 'jstree-file'
          });
        } else {
          // Es un paquete
          children.push(buildTree(obj[key], key));
        }
      }

      return {
        text: name || 'Raíz',
        children: children,
        type: 'package',
        icon: 'jstree-folder',
        state: { opened: name === 'Raíz' } // Abrir solo la raíz
      };
    }

    // Construir árbol completo
    const rootChildren = buildTree(packages, 'Raíz').children;
    treeData.push(...rootChildren);

    if (treeData.length === 0) {
      treeData.push({ text: 'No se encontraron clases .class', state: { disabled: true } });
    }

    // Destruir y recrear jsTree
    $('#tree').jstree('destroy');
    $('#tree').jstree({
      core: {
        data: treeData,
        themes: { stripes: true }
      },
      plugins: ['wholerow', 'types'],
      types: {
        package: { icon: 'jstree-folder' },
        class: { icon: 'jstree-file' }
      }
    });

    // Click en cualquier nodo → si es carpeta, expandir/colapsar
    $('#tree').on('select_node.jstree', function (e, data) {
      if (data.node.type === 'package') {
        $('#tree').jstree('toggle_node', data.node);
      }
    });

    // Al activar una clase (doble click o enter, pero también permitimos click)
    $('#tree').on('activate_node.jstree', async function (e, data) {
      if (data.node.type === 'class') {
        currentClassPath = data.node.original.path;
        setStatus('Descompilando ' + data.node.text + '...');

        try {
          const classFile = zipFiles[currentClassPath];
          const arrayBuffer = await classFile.async('arraybuffer');
          const className = currentClassPath.replace('.class', '').replace(/\//g, '.');

          let result;
          const decompiler = decompilerSelect.value;

          switch (decompiler) {
            case 'CFR':
              result = await org.katana.slicer.decompiler.CFR.decompile(arrayBuffer, className);
              break;
            case 'Vineflower':
              result = await org.katana.slicer.decompiler.Vineflower.decompile(arrayBuffer, className);
              break;
            case 'Procyon':
              result = await org.katana.slicer.decompiler.Procyon.decompile(arrayBuffer, className);
              break;
          }

          const code = result || '// No se pudo descompilar (muy ofuscado o error)';
          editor.setValue(code);
          editedSources[currentClassPath] = code;
          setStatus('¡Descompilado con ' + decompiler + '! Edita lo que quieras.');
        } catch (err) {
          editor.setValue('// ERROR: ' + (err.message || err));
          setStatus('Error al descompilar. Prueba otro descompilador.');
          console.error(err);
        }
      }
    });

    setStatus('¡Listo! Haz click en "com" o cualquier carpeta para expandirla.');
  });
});

function setStatus(msg) {
  document.getElementById('status').innerHTML = '<strong>' + msg + '</strong>';
                                                                           }    
