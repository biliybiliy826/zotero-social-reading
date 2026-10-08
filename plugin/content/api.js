var ZSRApi = class {
  constructor(dataDir, endpoint = '') {
    this.dataDir = dataDir;
    this.localEndpoint = 'http://127.0.0.1:34241';
    this.endpoint = String(endpoint || '').replace(/\/+$/u, '');
    this.localTokenPath = PathUtils.join(dataDir, 'social-reading', 'dev-token');
    this.cloudTokenPath = PathUtils.join(dataDir, 'social-reading', 'cloud-token');
    this.localToken = null;
    this.cloudToken = null;
    this.pdfDigestCache = new Map();
    this.documentTitles = new Map();
  }

  get cloudEnabled() { return Boolean(this.endpoint); }

  async request(method, path, body = null, { cloud = this.cloudEnabled, timeout = 15_000 } = {}) {
    let token = null;
    if (cloud && method !== 'GET' && path !== '/identify') {
      if (!this.cloudToken) {
        try { this.cloudToken = (await IOUtils.readUTF8(this.cloudTokenPath)).trim(); }
        catch { throw new Error('共享服务发布令牌未配置；公共导读仍可阅读'); }
      }
      token = this.cloudToken;
    }
    if (!cloud) {
      if (!this.localToken) this.localToken = (await IOUtils.readUTF8(this.localTokenPath)).trim();
      token = this.localToken;
    }
    const xhr = await Zotero.HTTP.request(method,
      (cloud ? this.endpoint + '/v1' : this.localEndpoint + '/api') + path, {
        headers: { ...(cloud ? token ? { Authorization: `Bearer ${token}` } : {} :
          { 'X-Social-Reading-Token': token }), 'Content-Type': 'application/json' },
        body: body == null ? undefined : JSON.stringify(body),
        responseType: 'text', successCodes: false, timeout,
      });
    let result;
    try { result = JSON.parse(xhr.responseText || '{}'); }
    catch { throw new Error(`共享服务返回无效 JSON (${xhr.status})`); }
    if (xhr.status < 200 || xhr.status >= 300) {
      throw new Error(result.error || `共享服务返回 ${xhr.status}`);
    }
    return result;
  }

  async pdfSHA256(filePath) {
    const stat = await IOUtils.stat(filePath);
    const key = `${filePath}:${stat.size}:${stat.lastModified}`;
    if (this.pdfDigestCache.has(key)) return this.pdfDigestCache.get(key);
    const file = Components.classes['@mozilla.org/file/local;1']
      .createInstance(Components.interfaces.nsIFile);
    file.initWithPath(filePath);
    const stream = Components.classes['@mozilla.org/network/file-input-stream;1']
      .createInstance(Components.interfaces.nsIFileInputStream);
    const hash = Components.classes['@mozilla.org/security/hash;1']
      .createInstance(Components.interfaces.nsICryptoHash);
    try {
      stream.init(file, -1, 0, 0);
      hash.init(hash.SHA256);
      hash.updateFromStream(stream, -1);
      const digest = Array.from(hash.finish(false), c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
      this.pdfDigestCache.set(key, digest);
      return digest;
    } finally { stream.close(); }
  }

  async identify(filePath, title) {
    if (!this.cloudEnabled) return this.request('POST', '/identify', { filePath, title });
    const id = await this.pdfSHA256(filePath);
    await this.request('GET', '/health');
    this.documentTitles.set(id, title);
    return { document: { id, title } };
  }
  ensureCloudDocument(documentId) {
    const title = this.documentTitles.get(documentId);
    if (!title) throw new Error('请重新打开 PDF 后再发表');
    return this.request('POST', '/identify', { sha256: documentId, title });
  }
  marks(documentId) { return this.request('GET', `/documents/${documentId}/marks`); }
  async publish(documentId, mark) {
    if (this.cloudEnabled) await this.ensureCloudDocument(documentId);
    return this.request('POST', `/documents/${documentId}/marks`, this.cloudEnabled ?
      { id: Services.uuid.generateUUID().toString().replace(/[{}]/gu, ''), ...mark } : mark);
  }
  replies(markId) { return this.request('GET', `/marks/${markId}/replies`); }
  reply(markId, value) {
    return this.request('POST', `/marks/${markId}/replies`,
      this.cloudEnabled ? { id: Services.uuid.generateUUID().toString().replace(/[{}]/gu, ''), ...value } : value);
  }
  async drafts(documentId, ownerId) {
    if (this.cloudEnabled) return { drafts: [] };
    return this.request('GET', `/documents/${documentId}/drafts?ownerId=${encodeURIComponent(ownerId)}`);
  }
  generate(documentId, filePath, ownerId) {
    return this.request('POST', `/documents/${documentId}/drafts`, { filePath, ownerId },
      { cloud: false, timeout: 210_000 });
  }
  async publishDraft(draftId, ownerId, position, draft = null) {
    if (this.cloudEnabled) {
      if (!draft) throw new Error('AI 草稿信息不完整');
      await this.ensureCloudDocument(draft.documentId);
      await this.request('POST', `/documents/${draft.documentId}/marks`, {
        id: draftId, ...position, quote: draft.quote, comment: draft.comment, authorKind: 'ai',
      });
    }
    return this.request('POST', `/drafts/${draftId}/publish`, { ownerId, ...position }, { cloud: false });
  }
  guide(documentId, tier) {
    if (!this.cloudEnabled) return Promise.resolve({ guide: null });
    return this.request('GET', `/documents/${documentId}/guides?tier=${encodeURIComponent(tier)}`);
  }
  generateGuide(filePath, title, tier) {
    return this.request('POST', '/guides/generate', { filePath, title, tier },
      { cloud: false, timeout: 210_000 });
  }
  async publishGuide(documentId, tier, guide) {
    if (!this.cloudEnabled) throw new Error('请先配置共享服务地址');
    await this.ensureCloudDocument(documentId);
    return this.request('POST', `/documents/${documentId}/guides`, {
      id: Services.uuid.generateUUID().toString().replace(/[{}]/gu, ''),
      tier, promptVersion: 1, overview: guide.overview, suggestions: guide.suggestions,
    });
  }
  async saveCloudToken(token) {
    if (!/^[a-f0-9]{64}$/u.test(token)) throw new Error('发布令牌应为 64 位十六进制字符串');
    await IOUtils.makeDirectory(PathUtils.parent(this.cloudTokenPath), { ignoreExisting: true });
    await IOUtils.writeUTF8(this.cloudTokenPath, `${token}\n`);
    const file = Components.classes['@mozilla.org/file/local;1']
      .createInstance(Components.interfaces.nsIFile);
    file.initWithPath(this.cloudTokenPath);
    file.permissions = 0o600;
    this.cloudToken = token;
  }
};
