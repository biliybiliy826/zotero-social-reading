var ZoteroSocialReadingPlugin;

function log(message, error) {
  Zotero.debug(`Social Reading: ${message}`);
  if (error) Zotero.logError(error);
}

async function startup({ id, version, rootURI }) {
  await Zotero.uiReadyPromise;
  for (const script of [
    'content/geometry.js', 'content/api.js', 'content/style.js',
    'content/reader-ui.js', 'content/main.js',
  ]) Services.scriptloader.loadSubScript(rootURI + script);
  await ZoteroSocialReadingPlugin.start({ id, version });
}

async function shutdown() {
  try { ZoteroSocialReadingPlugin?.stop(); }
  catch (error) { log('Shutdown failed', error); }
  ZoteroSocialReadingPlugin = undefined;
}

function install() {}
function uninstall() {}
