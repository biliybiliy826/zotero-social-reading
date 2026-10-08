var ZoteroSocialReadingPlugin = {
  id: null,
  views: new Map(),
  toolbarHandler: null,
  selectionHandler: null,

  pref(name) { return `extensions.zotero.socialReading.${name}`; },
  getPreference(name) { return Zotero.Prefs.get(this.pref(name), true); },
  setPreference(name, value) { Zotero.Prefs.set(this.pref(name), value, true); },

  async start({ id, version }) {
    this.id = id;
    this.api = new ZSRApi(Zotero.DataDirectory.dir);
    let ownerId = this.getPreference('ownerId');
    if (!ownerId) {
      ownerId = Services.uuid.generateUUID().toString().replace(/[{}]/gu, '');
      this.setPreference('ownerId', ownerId);
    }
    this.ownerId = ownerId;
    this.toolbarHandler = event => {
      try {
        const host = event.doc.createElement('div');
        event.append(host);
        void this.viewFor(event.reader).mount(host);
      } catch (error) { this.log('Toolbar event failed', error); }
    };
    this.selectionHandler = event => {
      try { this.viewFor(event.reader).onSelection(event); }
      catch (error) { this.log('Selection event failed', error); }
    };
    Zotero.Reader.registerEventListener('renderToolbar', this.toolbarHandler, id);
    Zotero.Reader.registerEventListener('renderTextSelectionPopup', this.selectionHandler, id);
    for (const reader of Zotero.Reader._readers || []) {
      const host = reader._iframeWindow?.document?.querySelector('.toolbar .custom-sections');
      if (host) void this.viewFor(reader).mount(host);
    }
    Zotero.SocialReading = {
      status: () => ({ version, readers: this.views.size,
        connected: [...this.views.values()].some(view => !!view.documentId) }),
      refresh: async () => {
        for (const view of this.views.values()) await view.reload();
      },
    };
    this.log(`Started ${version}`);
  },

  viewFor(reader) {
    const tabId = reader.tabID || String(reader.itemID);
    for (const [oldTabId, oldView] of this.views) {
      if (oldView.reader !== reader && !(Zotero.Reader._readers || []).includes(oldView.reader)) {
        oldView.destroy();
        this.views.delete(oldTabId);
      }
    }
    if (this.views.has(tabId)) return this.views.get(tabId);
    const view = new ZSRReaderView({
      reader, api: this.api, ownerId: this.ownerId,
      authorName: this.getPreference('authorName') || '匿名读者',
      getPreference: name => this.getPreference(name),
      setPreference: (name, value) => this.setPreference(name, value),
      onPublish: (documentId, source) => {
        for (const other of this.views.values()) {
          if (other !== source && other.documentId === documentId) {
            void other.reload().catch(error => this.log('Could not refresh another reader', error));
          }
        }
      },
      onVisibilityChanged: source => {
        for (const other of this.views.values()) {
          if (other !== source) { other.updateButtons(); other.scheduleRender(); }
        }
      },
      log: (message, error) => this.log(message, error),
    });
    this.views.set(tabId, view);
    reader._iframeWindow?.addEventListener('unload', () => {
      view.destroy();
      this.views.delete(tabId);
    }, { once: true });
    return view;
  },

  stop() {
    if (this.toolbarHandler) Zotero.Reader.unregisterEventListener('renderToolbar', this.toolbarHandler);
    if (this.selectionHandler) Zotero.Reader.unregisterEventListener('renderTextSelectionPopup', this.selectionHandler);
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    delete Zotero.SocialReading;
    this.id = null;
  },

  log(message, error) {
    Zotero.debug(`Social Reading: ${message}`);
    if (error) Zotero.logError(error);
  },
};
