var ZSRApi = class {
  constructor(dataDir, endpoint = 'http://127.0.0.1:34241') {
    this.tokenPath = PathUtils.join(dataDir, 'social-reading', 'dev-token');
    this.endpoint = endpoint;
    this.token = null;
  }

  async request(method, path, body = null, timeout = 15_000) {
    if (!this.token) this.token = (await IOUtils.readUTF8(this.tokenPath)).trim();
    const xhr = await Zotero.HTTP.request(method, this.endpoint + path, {
      headers: {
        'X-Social-Reading-Token': this.token,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      responseType: 'text', successCodes: false, timeout,
    });
    let result;
    try { result = JSON.parse(xhr.responseText || '{}'); }
    catch { throw new Error(`Local social service returned invalid JSON (${xhr.status})`); }
    if (xhr.status < 200 || xhr.status >= 300) {
      throw new Error(result.error || `Local social service returned ${xhr.status}`);
    }
    return result;
  }

  identify(filePath, title) { return this.request('POST', '/api/identify', { filePath, title }, 30_000); }
  marks(documentId) { return this.request('GET', `/api/documents/${documentId}/marks`); }
  publish(documentId, mark) { return this.request('POST', `/api/documents/${documentId}/marks`, mark); }
  replies(markId) { return this.request('GET', `/api/marks/${markId}/replies`); }
  reply(markId, value) { return this.request('POST', `/api/marks/${markId}/replies`, value); }
  drafts(documentId, ownerId) {
    return this.request('GET', `/api/documents/${documentId}/drafts?ownerId=${encodeURIComponent(ownerId)}`);
  }
  generate(documentId, filePath, ownerId) {
    return this.request('POST', `/api/documents/${documentId}/drafts`, { filePath, ownerId }, 210_000);
  }
  publishDraft(draftId, ownerId, position) {
    return this.request('POST', `/api/drafts/${draftId}/publish`, { ownerId, ...position });
  }
};
