var ZoteroSocialReadingPlugin;

function log(message, error) {
  Zotero.debug(`Social Reading: ${message}`);
  if (error) Zotero.logError(error);
}

async function startup({ id, version, rootURI }) {
  await Zotero.uiReadyPromise;
  for (const script of [
    'content/vendor/katex/katex.min.js', 'content/vendor/codex-markdown.js',
    'content/geometry.js', 'content/api.js', 'content/style.js',
    'content/rich-text.js', 'content/codex-bridge.js',
    'content/reader-ui.js', 'content/main.js',
  ]) Services.scriptloader.loadSubScript(rootURI + script);
  const [richStyles, katexStyles] = await Promise.all([
    Zotero.File.getResourceAsync(rootURI + 'content/rich-style.css'),
    Zotero.File.getResourceAsync(rootURI + 'content/vendor/katex/katex.min.css'),
  ]);
  ZSRStyle.rich = richStyles + '\n' + katexStyles.replace(
    /url\((['"]?)(fonts\/[^)'"]+)\1\)/gu,
    (_match, _quote, path) => `url("${rootURI}content/vendor/katex/${path}")`,
  );
  await ZoteroSocialReadingPlugin.start({ id, version });
}

async function shutdown() {
  try { ZoteroSocialReadingPlugin?.stop(); }
  catch (error) { log('Shutdown failed', error); }
  ZoteroSocialReadingPlugin = undefined;
}

function install() {}
function uninstall() {}
