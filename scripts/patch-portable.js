const fs = require('fs');
const path = require('path');

const nsiPath = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'templates', 'nsis', 'portable.nsi');

if (!fs.existsSync(nsiPath)) {
  console.warn('[Patch-Portable] portable.nsi not found at:', nsiPath);
  process.exit(0);
}

let content = fs.readFileSync(nsiPath, 'utf8');
let modified = false;

if (content.includes('StrCpy $INSTDIR "$PLUGINSDIR\\app"')) {
  content = content.replace(
    'StrCpy $INSTDIR "$PLUGINSDIR\\app"',
    'StrCpy $INSTDIR "$EXEDIR\\runtime"'
  );
  modified = true;
}

if (content.includes('StrCpy $INSTDIR "$TEMP\\${UNPACK_DIR_NAME}"')) {
  content = content.replace(
    'StrCpy $INSTDIR "$TEMP\\${UNPACK_DIR_NAME}"',
    'StrCpy $INSTDIR "$EXEDIR\\${UNPACK_DIR_NAME}"'
  );
  modified = true;
}

if (content.includes('SetOutPath $EXEDIR') && !content.includes('Sleep 500')) {
  content = content.replace(
    /SetOutPath \$EXEDIR[\r\n\t ]+RMDir \/r \$INSTDIR/,
    'SetOutPath $EXEDIR\r\n  Sleep 500\r\n\tRMDir /r $INSTDIR'
  );
  modified = true;
}

if (modified) {
  fs.writeFileSync(nsiPath, content, 'utf8');
  console.log('[Patch-Portable] Successfully patched portable.nsi to extract into $EXEDIR!');
} else {
  console.log('[Patch-Portable] portable.nsi is already configured for $EXEDIR.');
}
