var ZSRRichText = {
  render(doc, value) {
    const node = doc.createElement('div');
    node.className = 'zsr-rich';
    ZoteroCodexModules.Markdown.appendMarkdown(doc, node, String(value || ''), {
      openTarget: target => {
        if (/^https?:\/\//iu.test(target)) Zotero.launchURL(target);
      },
    });
    return node;
  },
};
