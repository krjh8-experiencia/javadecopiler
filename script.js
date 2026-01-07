let zipFiles = {};
let currentClassPath = null;
let editedSources = {};

// Variable para saber si Slicer ya está listo
let slicerReady = false;

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' }});
require(['vs/editor/editor.main'], function() {
  const editor = monaco.editor.create(document.getElementById('editor'), {
    value: '// Sube un .jar → haz click en las carpetas para expandirlas → selecciona una clase',
    language: 'java',
    theme: 'vs-dark',
    automaticLayout: true
  });

  // Selector de descompilador
  const decompilerSelect = document.createElement('select');
  decompilerSelect.innerHTML = `
    <option value="CFR">CFR</option>
    <option value="Vineflower" selected>Vineflower (recomendado)</option>
    <option value="Procyon">Procyon</option>
  `;
  decompilerSelect.style.cssText = 'margin: 20px auto; display: block; padding: 10px; font-size: 16px; border-radius: 8px; width: 300px;';
  document.querySelector('h1').after(decompilerSelect);

  // Esperar a que Slicer cargue completamente
  setStatus('Cargando descompiladores (Slicer)... Esto puede tardar 10-20 segundos la primera vez.');

  // Slicer expone una promesa global cuando está listo
  window.addEventListener('load', () => {
    if (window.Java && window.Java.isReady) {
      window.Java.isReady().then(() => {
        slicerReady = true;
        setStatus('Descompiladores cargados. ¡Sube un .jar para empezar!');
      });
    }
  });

  // Si por alguna razón no carga en 60 segundos
  setTimeout(() => {
    if (!slicerReady) {
      setStatus('Error: Slicer tardó demasiado en cargar. Recarga la página.');
    }
  }, 60000);

  document.getElementById('jarInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!slicerReady) {
      setStatus('Espera a que los descompiladores terminen de cargar...');
      return;
    }

    setStatus('Descomprimiendo el JAR...');
    const zip = await JSZip.loadAsync(file);
    zipFiles = zip.files;
    editedSources = {};

    const treeData = [];

    const packages = {};

    for (const path in zipFiles) {
      if (path.endsWith('.class') && !path.includes('META-INF/') && !path.startsWith('.')) {
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

    function buildTree(obj, name) {
      const children = [];
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          children.push({
            text: key,
            type: 'class',
            path: obj[key],
            icon: 'jstree-file'
          });
        } else {
          children.push(buildTree(obj[key], key));
        }
      }
      return {
        text: name,
        children: children.length > 0 ? children : false,
        type: 'package',
        icon: 'jstree-folder',
        state: { opened: name === 'com' } // Opcional: abrir "com" automáticamente
      };
    }

    for (const pkg in packages) {
      treeData.push(buildTree(packages[pkg], pkg));
    }

    if (treeData.length === 0) {
      treeData.push({ text: 'No se encontraron clases .class', state: { disabled: true } });
    }

    $('#tree').jstree('destroy');
    $('#tree').jstree({
      core: { data: treeData },
      plugins: ['wholerow', 'types'],
      types: {
        package: { icon: 'jstree-folder' },
        class: { icon: 'jstree-file' }
      }
    });

    // Click en carpeta → expandir
    $('#tree').on('select_node.jstree', (e, data) => {
      if (data.node.type === 'package') {
        $('#tree').jstree('toggle_node', data.node);
      }
    });

    // Click en clase → descompilar
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

          const code = result || '// No se pudo descompilar correctamente';
          editor.setValue(code);
          editedSources[currentClassPath] = code;
          setStatus('¡Descompilado! Edita el código y después podremos recompilar.');
        } catch (err) {
          editor.setValue('// ERROR: ' + (err.message || err));
          setStatus('Error al descompilar. Prueba otro descompilador.');
          console.error(err);
        }
      }
    });

    setStatus('¡JAR cargado! Haz click en las carpetas (como "com") para expandirlas.');
  });
});

function setStatus(msg) {
  document.getElementById('status').innerHTML = '<strong>' + msg + '</strong>';
            }
