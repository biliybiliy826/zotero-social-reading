var ZSRReaderView = class {
  constructor({ reader, api, ownerId, authorName, getPreference, setPreference,
    onPublish, onVisibilityChanged, log }) {
    this.reader = reader;
    this.api = api;
    this.ownerId = ownerId;
    this.authorName = authorName;
    this.getPreference = getPreference;
    this.setPreference = setPreference;
    this.onPublish = onPublish;
    this.onVisibilityChanged = onVisibilityChanged;
    this.log = log;
    this.documentId = null;
    this.pdfPath = null;
    this.marks = [];
    this.drafts = [];
    this.guide = null;
    this.privateGuide = null;
    this.guideGenerating = false;
    this.guidePublishing = false;
    this.guideTier = this.getPreference('guideTier') || 'beginner';
    this.guideStep = 0;
    this.draftPositions = new Map();
    this.nextDraftIndex = 0;
    this.refreshPending = false;
    this.refreshTimer = null;
    this.observer = null;
    this.scrollTarget = null;
    this.resizeWindow = null;
    this.destroyed = false;
  }

  outerDocument() { return this.reader._iframeWindow?.document; }
  innerWindow() { return this.reader._internalReader?._primaryView?._iframeWindow; }
  innerDocument() { return this.innerWindow()?.document; }

  async mount(toolbarHost) {
    if (this.destroyed || this.toolbar?.isConnected) return;
    const doc = toolbarHost.ownerDocument;
    this.ensureStyle(doc, 'zsr-toolbar-style', ZSRStyle.toolbar);
    this.ensureStyle(doc, 'zsr-rich-style', ZSRStyle.rich);
    this.toolbar = doc.createElement('div');
    this.toolbar.className = 'zsr-toolbar';
    this.highlightButton = this.createButton(doc, '公共划线', () => this.toggle('publicHighlights'));
    this.noteButton = this.createButton(doc, '公共笔记', () => this.toggle('publicNotes'));
    this.aiButton = this.createButton(doc, 'AI 导读', () => this.toggleGuidePanel());
    this.draftButton = this.createButton(doc, 'AI 草稿', () => this.jumpToNextDraft());
    this.draftButton.hidden = true;
    this.status = doc.createElement('span');
    this.status.className = 'zsr-status';
    this.status.title = 'Zotero Social Reading';
    this.toolbar.append(this.highlightButton, this.noteButton, this.aiButton, this.draftButton, this.status);
    toolbarHost.append(this.toolbar);
    this.updateButtons();
    try {
      const item = this.reader._item || Zotero.Items.get(this.reader.itemID);
      this.pdfPath = await item.getFilePathAsync();
      if (!this.pdfPath) throw new Error('PDF file is not available locally');
      const parent = item.parentID ? Zotero.Items.get(item.parentID) : null;
      const title = parent?.getField('title') || item.getField('title') || 'Untitled PDF';
      this.title = title;
      const identified = await this.api.identify(this.pdfPath, title);
      this.documentId = identified.document.id;
      await this.reload();
      try { await this.loadGuide(); }
      catch (error) { this.log('Could not load shared guide', error); }
      this.attachOverlayWhenReady();
      clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => {
        if (!this.destroyed) void this.reload().catch(error => this.log('Background refresh failed', error));
      }, 20_000);
      this.setStatus('已连接', false);
    } catch (error) {
      this.setStatus('共享服务未连接', true);
      this.log('Could not open social reading for this PDF', error);
    }
  }

  createButton(doc, label, click) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'zsr-toolbar-button';
    button.textContent = label;
    button.addEventListener('click', event => { event.stopPropagation(); click(); });
    return button;
  }

  askCodexButton(doc, discussion, errorHost) {
    const button = this.createButton(doc, '问 Codex', async () => {
      button.disabled = true;
      try {
        await ZSRCodexBridge.prepare(this.reader, {
          ...discussion(), title: this.title,
        });
        errorHost.querySelector('.zsr-error-message')?.remove();
        this.setStatus('已加入 Codex 草稿，请检查后发送');
      } catch (error) {
        this.showCardError(errorHost, error);
        this.setStatus(error.message || String(error), true);
      } finally { button.disabled = false; }
    });
    button.className = 'zsr-ask-codex';
    return button;
  }

  ensureStyle(doc, id, content) {
    if (doc.getElementById(id)) return;
    const style = doc.createElement('style');
    style.id = id;
    style.textContent = content;
    doc.head.append(style);
  }

  setStatus(message, error = false) {
    if (!this.status) return;
    this.status.textContent = message;
    this.status.classList.toggle('zsr-error', error);
    this.status.title = message;
  }

  toggle(key) {
    this.setPreference(key, !this.getPreference(key));
    this.updateButtons();
    this.scheduleRender();
    this.onVisibilityChanged?.(this);
    if (this.getPreference(key)) void this.reload().catch(error => this.log('Could not refresh public marks', error));
  }

  updateButtons() {
    for (const [button, key] of [
      [this.highlightButton, 'publicHighlights'], [this.noteButton, 'publicNotes'],
    ]) {
      button?.classList.toggle('zsr-active', !!this.getPreference(key));
      button?.setAttribute('aria-pressed', String(!!this.getPreference(key)));
    }
  }

  async reload() {
    if (!this.documentId) return;
    const [marks, drafts] = await Promise.all([
      this.api.marks(this.documentId), this.api.drafts(this.documentId, this.ownerId),
    ]);
    if (this.destroyed) return;
    this.marks = marks.marks;
    this.drafts = drafts.drafts;
    this.draftButton.hidden = !this.drafts.length;
    this.draftButton.textContent = `AI 草稿 ${this.drafts.length}`;
    this.scheduleRender();
  }

  async loadGuide() {
    if (!this.documentId) return;
    const tier = this.guideTier;
    const documentId = this.documentId;
    const privateGuide = await this.api.loadPrivateGuide(documentId, tier);
    if (tier !== this.guideTier || documentId !== this.documentId || this.destroyed) return;
    this.privateGuide = privateGuide;
    this.updateGuidePanel();
    this.scheduleRender();
    const response = await this.api.guide(documentId, tier);
    if (tier !== this.guideTier || documentId !== this.documentId || this.destroyed) return;
    this.guide = response.guide;
    this.guideStep = Math.min(this.guideStep, Math.max(0, (this.guide?.suggestions.length || 1) - 1));
    this.updateGuidePanel();
    this.scheduleRender();
  }

  toggleGuidePanel() {
    if (this.guidePanel?.isConnected) {
      this.guidePanel.remove();
      this.guidePanel = null;
      return;
    }
    const doc = this.outerDocument();
    if (!doc) return;
    const panel = doc.createElement('aside');
    panel.className = 'zsr-guide-panel';
    doc.body.append(panel);
    this.guidePanel = panel;
    this.updateGuidePanel();
  }

  updateGuidePanel() {
    const panel = this.guidePanel;
    if (!panel?.isConnected) return;
    const doc = panel.ownerDocument;
    panel.replaceChildren();
    const heading = doc.createElement('header');
    const title = doc.createElement('strong');
    title.textContent = 'AI 导读';
    const close = this.createButton(doc, '×', () => this.toggleGuidePanel());
    close.className = 'zsr-close';
    heading.append(title, close);
    const intro = doc.createElement('p');
    intro.textContent = '导读显示在正文中。AI 内容可能有误，请对照论文原文。';
    const tierLabel = doc.createElement('label');
    tierLabel.textContent = '丰富程度 ';
    const tier = doc.createElement('select');
    for (const [value, label] of [['beginner', '新手 · 详细'], ['standard', '标准 · 重点'], ['concise', '简洁 · 核心']]) {
      const option = doc.createElement('option');
      option.value = value;
      option.textContent = label;
      tier.append(option);
    }
    tier.value = this.guideTier;
    tier.addEventListener('change', () => {
      this.guideTier = tier.value;
      this.setPreference('guideTier', tier.value);
      this.privateGuide = null;
      this.guide = null;
      this.guideStep = 0;
      void this.loadGuide().catch(error => this.setGuideMessage(error.message, true));
      this.updateGuidePanel();
    });
    tierLabel.append(tier);
    const visible = doc.createElement('label');
    const checkbox = doc.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!this.getPreference('guideVisible');
    checkbox.addEventListener('change', () => {
      this.setPreference('guideVisible', checkbox.checked);
      this.scheduleRender();
    });
    visible.append(checkbox, ' 在正文显示导读批注');
    const status = doc.createElement('p');
    status.className = 'zsr-guide-message';
    status.textContent = this.guideGenerating ? 'Codex 正在生成导读，可能需要几分钟…' :
      this.guidePublishing ? '正在公开共享导读…' :
      this.guide ? '已复用共享导读，无需再次消耗你的 Codex 额度。' :
      this.privateGuide ? '本机生成的私人预览，尚未共享。' : '当前档位尚无共享导读。';
    const source = this.guide || this.privateGuide;
    panel.append(heading, intro, tierLabel, visible, status);
    if (source) {
      const overview = doc.createElement('details');
      overview.className = 'zsr-guide-overview';
      const overviewHeading = doc.createElement('summary');
      overviewHeading.textContent = '导读总览';
      const overviewText = ZSRRichText.render(doc, source.overview);
      overview.append(overviewHeading, overviewText);
      panel.append(overview);
      const steps = source.suggestions;
      const active = Math.min(this.guideStep, steps.length - 1);
      const suggestion = steps[active];
      const step = doc.createElement('section');
      step.className = 'zsr-guide-step';
      const progress = doc.createElement('strong');
      progress.textContent = `导读 ${active + 1} / ${steps.length} · PDF 第 ${suggestion.pageIndex + 1} 页`;
      const quote = doc.createElement('blockquote');
      quote.textContent = suggestion.quote;
      const explanation = ZSRRichText.render(doc, suggestion.comment);
      const controls = doc.createElement('div');
      controls.className = 'zsr-guide-controls';
      const previous = this.createButton(doc,
        active ? `上一条 · 第 ${steps[active - 1].pageIndex + 1} 页` : '上一条',
        () => this.jumpToGuide(active - 1));
      previous.disabled = active === 0;
      const locate = this.createButton(doc, '定位原文', () => this.jumpToGuide(active));
      const next = this.createButton(doc,
        active < steps.length - 1 ? `下一条 · 第 ${steps[active + 1].pageIndex + 1} 页` : '下一条',
        () => this.jumpToGuide(active + 1));
      next.disabled = active === steps.length - 1;
      controls.append(previous, locate, next);
      const ask = this.askCodexButton(doc, () => ({
        kind: 'guide', pageIndex: suggestion.pageIndex,
        quote: suggestion.quote, body: suggestion.comment,
      }), step);
      step.append(progress, controls, quote, explanation, ask);
      panel.append(step);
      const index = doc.createElement('details');
      index.className = 'zsr-guide-index';
      const summary = doc.createElement('summary');
      summary.textContent = `全部 ${steps.length} 条导读`;
      index.append(summary);
      const list = doc.createElement('ol');
      for (const [position, itemSuggestion] of steps.entries()) {
        const item = doc.createElement('li');
        const button = this.createButton(doc, `第 ${itemSuggestion.pageIndex + 1} 页 · ${itemSuggestion.comment.slice(0, 60)}…`,
          () => this.jumpToGuide(position));
        if (position === active) button.setAttribute('aria-current', 'step');
        item.append(button);
        list.append(item);
      }
      index.append(list);
      panel.append(index);
    }
    if (!this.guide && !this.privateGuide) {
      const generate = this.createButton(doc, '使用本机 Codex 生成导读', () => { void this.generateGuide(); });
      generate.className = 'zsr-guide-primary';
      generate.disabled = this.guideGenerating;
      panel.append(generate);
    }
    if (this.privateGuide && !this.guide) {
      const note = doc.createElement('p');
      note.textContent = '确认后将导读文字、引用和页码公开给使用同一 PDF 的读者；不会上传 PDF 文件。';
      const publish = this.createButton(doc, '公开共享这份导读', () => { void this.publishGuide(); });
      publish.className = 'zsr-guide-primary';
      publish.disabled = this.guidePublishing;
      panel.append(note, publish);
    }
    const settings = doc.createElement('details');
    const summary = doc.createElement('summary');
    summary.textContent = '共享服务设置';
    const endpoint = doc.createElement('input');
    endpoint.type = 'url';
    endpoint.placeholder = 'https://…workers.dev';
    endpoint.value = this.api.endpoint;
    const token = doc.createElement('input');
    token.type = 'password';
    token.placeholder = '个人发布令牌（阅读无需填写）';
    const save = this.createButton(doc, '保存并连接', async () => {
      try {
        const value = endpoint.value.trim().replace(/\/+$/u, '');
        if (value && !/^https:\/\//u.test(value)) throw new Error('共享服务必须使用 HTTPS');
        if (token.value.trim()) await this.api.saveCloudToken(token.value.trim());
        this.api.endpoint = value;
        this.setPreference('cloudEndpoint', value);
        const identified = await this.api.identify(this.pdfPath, this.title);
        this.documentId = identified.document.id;
        this.privateGuide = null;
        await this.reload();
        await this.loadGuide();
        this.setGuideMessage('已连接共享服务');
      } catch (error) { this.setGuideMessage(error.message, true); }
    });
    settings.append(summary, endpoint, token, save);
    panel.append(settings);
  }

  setGuideMessage(message, error = false) {
    const target = this.guidePanel?.querySelector('.zsr-guide-message');
    if (target) {
      target.textContent = message;
      target.classList.toggle('zsr-error', error);
    }
    this.setStatus(message, error);
  }

  async generateGuide() {
    if (!this.pdfPath || !this.documentId || this.guideGenerating) return;
    const tier = this.guideTier;
    const documentId = this.documentId;
    this.guideGenerating = true;
    this.updateGuidePanel();
    let failure = null;
    try {
      // Recheck the shared cache immediately before spending the local user's tokens.
      try { await this.loadGuide(); }
      catch (error) { this.log('Shared guide cache unavailable; generating a private guide', error); }
      if (this.guide || this.privateGuide) return;
      const result = await this.api.generateGuide(this.pdfPath, this.title, tier);
      if (tier !== this.guideTier || documentId !== this.documentId || this.destroyed) return;
      this.privateGuide = result.guide;
      this.guideStep = 0;
      this.scheduleRender();
      try { await this.api.savePrivateGuide(documentId, tier, result.guide); }
      catch (error) { failure = new Error(`导读已生成，但保存到 Zotero 数据目录失败：${error.message}`); }
    } catch (error) { failure = error; }
    finally {
      this.guideGenerating = false;
      this.updateGuidePanel();
      if (failure) this.setGuideMessage(failure.message, true);
    }
  }

  async publishGuide() {
    if (!this.privateGuide || this.guidePublishing) return;
    this.guidePublishing = true;
    this.updateGuidePanel();
    let failure = null;
    try {
      await this.api.publishGuide(this.documentId, this.guideTier, this.privateGuide);
      await this.loadGuide();
    } catch (error) { failure = error; }
    finally {
      this.guidePublishing = false;
      this.updateGuidePanel();
      this.setGuideMessage(failure ? failure.message : '导读已公开共享', !!failure);
    }
  }

  jumpToGuide(index) {
    const source = this.guide || this.privateGuide;
    if (!source?.suggestions[index]) return;
    this.guideStep = index;
    if (!this.getPreference('guideVisible')) this.setPreference('guideVisible', true);
    this.updateGuidePanel();
    if (this.guidePanel) this.guidePanel.scrollTop = 0;
    const suggestion = source.suggestions[index];
    this.reader._internalReader.navigate(Components.utils.cloneInto(
      { pageIndex: suggestion.pageIndex }, this.reader._iframeWindow));
    const seek = attempt => {
      if (this.destroyed || this.guideStep !== index) return;
      try { this.render(); }
      catch (error) { this.log('Could not locate AI guide step', error); }
      const page = this.innerDocument()?.querySelector(`.page[data-page-number="${suggestion.pageIndex + 1}"]`);
      const marker = page?.querySelector(`.zsr-guide-marker[data-guide-index="${index}"]`);
      if (marker) {
        marker.scrollIntoView(Components.utils.cloneInto({ block: 'center', inline: 'nearest' }, this.innerWindow()));
      } else if (attempt < 30) setTimeout(() => seek(attempt + 1), 200);
      else this.setGuideMessage('已跳到对应页，但无法在正文定位这条引用', true);
    };
    setTimeout(() => seek(0), 200);
  }

  jumpToNextDraft() {
    if (!this.drafts.length) return;
    const draft = this.drafts[this.nextDraftIndex++ % this.drafts.length];
    this.reader._internalReader.navigate(Components.utils.cloneInto(
      { pageIndex: draft.pageIndex }, this.reader._iframeWindow,
    ));
    const seek = attempt => {
      if (this.destroyed) return;
      try { this.render(); }
      catch (error) { this.log('Could not locate AI draft', error); }
      const page = this.innerDocument()?.querySelector(`.page[data-page-number="${draft.pageIndex + 1}"]`);
      const marker = [...(page?.querySelectorAll('.zsr-draft-marker') || [])]
        .find(node => node.title === '私人 AI 评论草稿');
      if (marker) {
        marker.scrollIntoView(Components.utils.cloneInto({ block: 'center', inline: 'nearest' }, this.innerWindow()));
      } else if (attempt < 30) {
        setTimeout(() => seek(attempt + 1), 200);
      } else this.setStatus('无法定位 AI 草稿', true);
    };
    setTimeout(() => seek(0), 200);
  }

  attachOverlayWhenReady(attempt = 0) {
    if (this.destroyed || this.startOverlay()) return;
    if (attempt >= 60) {
      this.setStatus('PDF 标记层未就绪', true);
      return;
    }
    this.overlayTimer = setTimeout(() => this.attachOverlayWhenReady(attempt + 1), 500);
  }

  startOverlay() {
    const win = this.innerWindow();
    const doc = win?.document;
    if (!doc?.querySelector('.page') || this.observer) return !!this.observer;
    this.ensureStyle(doc, 'zsr-page-style', ZSRStyle.page);
    this.ensureStyle(doc, 'zsr-rich-style', ZSRStyle.rich);
    this.scrollTarget = doc.querySelector('#viewerContainer') || win;
    this.resizeWindow = win;
    this.onScroll = () => this.scheduleRender();
    this.scrollTarget.addEventListener('scroll', this.onScroll, true);
    win.addEventListener('resize', this.onScroll);
    this.observer = new win.MutationObserver(records => {
      if (records.some(record => this.relevantMutation(record))) this.scheduleRender();
    });
    const options = { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'data-loaded'] };
    this.observer.observe(doc.documentElement, Components.utils.cloneInto(options, win));
    this.scheduleRender();
    return true;
  }

  relevantMutation(record) {
    if (record.type === 'attributes') return record.target?.classList?.contains('page');
    return [...record.addedNodes].some(node => node.nodeType === 1 &&
      !node.classList?.contains('zsr-overlay') && !node.classList?.contains('zsr-popover') &&
      (node.classList?.contains('page') || node.classList?.contains('textLayer') ||
        node.querySelector?.('.page, .textLayer')));
  }

  scheduleRender() {
    if (this.refreshPending || this.destroyed) return;
    this.refreshPending = true;
    // Background reader tabs can pause requestAnimationFrame. A short timer also
    // catches pages that finish rendering before the reader becomes foreground.
    this.refreshTimer = setTimeout(() => {
      this.refreshPending = false;
      try { this.render(); }
      catch (error) { this.log('Could not draw shared marks', error); }
    }, 30);
  }

  pageViewport(pageIndex) {
    // Zotero keeps a sparse buffer of rendered page wrappers, not an array
    // indexed by PDF page number. Find the active wrapper by its page index.
    const pages = this.reader._internalReader?._primaryView?._pages || [];
    return pages.find(page => page._pageIndex === pageIndex)?._originalPage?.viewport;
  }

  render() {
    const doc = this.innerDocument();
    const win = this.innerWindow();
    if (!doc || !win) return;
    const showHighlights = !!this.getPreference('publicHighlights');
    const showNotes = !!this.getPreference('publicNotes');
    for (const page of doc.querySelectorAll('.page[data-page-number]')) {
      const pageIndex = Number(page.dataset.pageNumber) - 1;
      const box = page.getBoundingClientRect();
      const existing = page.querySelector(':scope > .zsr-overlay');
      if (box.bottom < -300 || box.top > win.innerHeight + 300 || !page.dataset.loaded) {
        existing?.remove();
        continue;
      }
      const viewport = this.pageViewport(pageIndex);
      if (!viewport?.transform) continue;
      const matrix = Array.from(viewport.transform, Number);
      const overlay = existing || doc.createElement('div');
      overlay.className = 'zsr-overlay';
      if (!existing) page.append(overlay);
      overlay.replaceChildren();
      this.draftPositions.forEach((_, id) => {
        if (this.drafts.some(draft => draft.id === id && draft.pageIndex === pageIndex)) this.draftPositions.delete(id);
      });
      for (const mark of this.marks) {
        if (mark.pageIndex !== pageIndex) continue;
        if (!showHighlights && !(showNotes && mark.comment)) continue;
        this.draw(overlay, mark.rects, matrix, {
          note: showNotes && Boolean(mark.comment), line: showHighlights,
          ai: mark.authorKind === 'ai', click: event => { void this.openCard(mark, null, event); },
        });
      }
      for (const draft of this.drafts) {
        if (draft.pageIndex !== pageIndex) continue;
        const cssRects = ZSRGeometry.findQuoteRects(page, draft.quote);
        if (!cssRects.length) continue;
        const rects = cssRects.map(rect => ZSRGeometry.cssToPdf(rect, matrix));
        this.draftPositions.set(draft.id, rects);
        this.draw(overlay, rects, matrix, {
          note: true, line: true, draft: true,
          click: event => { void this.openCard(null, draft, event); },
        });
      }
      const guide = this.guide || this.privateGuide;
      if (guide && this.getPreference('guideVisible')) {
        for (const [index, suggestion] of guide.suggestions.entries()) {
          if (suggestion.pageIndex !== pageIndex) continue;
          const cssRects = ZSRGeometry.findQuoteRects(page, suggestion.quote);
          if (!cssRects.length) continue;
          const rects = cssRects.map(rect => ZSRGeometry.cssToPdf(rect, matrix));
          this.draw(overlay, rects, matrix, { note: true, line: true, ai: true, guideIndex: index,
            click: event => this.openGuideCard(suggestion, event, index) });
        }
      }
    }
  }

  draw(overlay, rects, matrix, { note, line, ai, draft, guideIndex, click }) {
    const boxes = rects.map(rect => ZSRGeometry.pdfToCss(rect, matrix));
    if (line) {
      for (const [left, top, right, bottom] of boxes) {
        const stripe = overlay.ownerDocument.createElement('span');
        stripe.className = `zsr-line${draft ? ' zsr-draft-line' : ''}`;
        stripe.style.left = `${left}px`;
        stripe.style.top = `${top}px`;
        stripe.style.width = `${right - left}px`;
        stripe.style.height = `${bottom - top}px`;
        overlay.append(stripe);
      }
    }
    if (!note || !boxes.length) return;
    const last = boxes.at(-1);
    const marker = overlay.ownerDocument.createElement('button');
    marker.type = 'button';
    marker.className = `zsr-marker${draft ? ' zsr-draft-marker' : ''}${guideIndex !== undefined ? ' zsr-guide-marker' : ''}`;
    if (guideIndex !== undefined) marker.dataset.guideIndex = String(guideIndex);
    marker.textContent = draft ? 'AI 草稿' : ai ? 'AI' : '评';
    marker.title = draft ? '私人 AI 评论草稿' : guideIndex !== undefined ? 'AI 导读批注' :
      ai ? 'AI 发表的评论' : '查看公共评论';
    marker.style.left = `${Math.min(last[2] + 5, (overlay.parentElement?.clientWidth || 1000) - 42)}px`;
    marker.style.top = `${last[1]}px`;
    marker.addEventListener('pointerdown', event => event.stopPropagation());
    marker.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); click(event); });
    overlay.append(marker);
  }

  closeCard() { this.innerDocument()?.querySelector('.zsr-popover')?.remove(); }

  openGuideCard(suggestion, event, index) {
    const doc = this.innerDocument();
    if (!doc) return;
    this.guideStep = index;
    this.updateGuidePanel();
    this.closeCard();
    const card = doc.createElement('div');
    card.className = 'zsr-popover';
    card.style.left = `${Math.max(12, Math.min(event.clientX + 8, doc.defaultView.innerWidth - 330))}px`;
    card.style.top = `${Math.max(50, Math.min(event.clientY + 8, doc.defaultView.innerHeight - 320))}px`;
    const title = doc.createElement('strong');
    title.textContent = this.guide ? 'AI 导读 · 已共享' : 'AI 导读 · 私人预览';
    const close = this.createButton(doc, '×', () => this.closeCard());
    close.className = 'zsr-close';
    const quote = doc.createElement('blockquote');
    quote.textContent = suggestion.quote;
    const comment = ZSRRichText.render(doc, suggestion.comment);
    const ask = this.askCodexButton(doc, () => ({
      kind: 'guide', pageIndex: suggestion.pageIndex,
      quote: suggestion.quote, body: suggestion.comment,
    }), card);
    card.append(title, close, quote, comment, ask);
    doc.body.append(card);
  }

  async openCard(mark, draft, event) {
    const doc = this.innerDocument();
    if (!doc) return;
    this.closeCard();
    const card = doc.createElement('div');
    card.className = 'zsr-popover';
    card.style.left = `${Math.max(12, Math.min(event.clientX + 8, doc.defaultView.innerWidth - 330))}px`;
    card.style.top = `${Math.max(50, Math.min(event.clientY + 8, doc.defaultView.innerHeight - 320))}px`;
    const title = doc.createElement('strong');
    title.textContent = draft ? 'AI 评论草稿 · 仅自己可见' :
      mark.authorKind === 'ai' ? 'AI 阅读助手 · 已公开' : `${mark.authorName} · 已公开`;
    const close = this.createButton(doc, '×', () => this.closeCard());
    close.className = 'zsr-close';
    const quote = doc.createElement('blockquote');
    quote.textContent = draft?.quote || mark.quote;
    const comment = ZSRRichText.render(doc, draft?.comment || mark.comment || '这段划线尚无评论。');
    const ask = this.askCodexButton(doc, () => ({
      kind: draft ? 'draft' : 'comment', pageIndex: draft?.pageIndex ?? mark.pageIndex,
      quote: draft?.quote || mark.quote, body: draft?.comment || mark.comment,
    }), card);
    card.append(title, close, quote, comment, ask);
    if (draft) {
      const publish = this.createButton(doc, '发表这条 AI 评论', async () => {
        const rects = this.draftPositions.get(draft.id);
        if (!rects?.length) return;
        publish.disabled = true;
        try {
          await this.api.publishDraft(draft.id, this.ownerId, { pageIndex: draft.pageIndex, rects },
            { ...draft, documentId: this.documentId });
          this.closeCard();
          await this.reload();
          this.onPublish?.(this.documentId, this);
        } catch (error) { this.showCardError(card, error); publish.disabled = false; }
      });
      publish.disabled = !this.draftPositions.get(draft.id)?.length;
      card.append(publish);
    } else {
      const replies = doc.createElement('div');
      replies.className = 'zsr-replies';
      card.append(replies);
      const form = doc.createElement('form');
      const input = doc.createElement('textarea');
      input.placeholder = '回复这条评论…支持 Markdown 和 $LaTeX$';
      input.maxLength = 5000;
      const preview = this.composePreview(doc, input);
      const submit = doc.createElement('button');
      submit.textContent = '回复';
      form.append(input, preview, submit);
      form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!input.value.trim()) return;
        submit.disabled = true;
        try {
          await this.api.reply(mark.id, { body: input.value.trim(), ownerId: this.ownerId, authorName: this.authorName });
          input.value = '';
          preview.replaceChildren();
          preview.hidden = true;
          await this.loadReplies(mark.id, replies);
        } catch (error) { this.showCardError(card, error); }
        finally { submit.disabled = false; }
      });
      card.append(form);
      void this.loadReplies(mark.id, replies).catch(error => this.showCardError(card, error));
    }
    doc.body.append(card);
  }

  async loadReplies(markId, target) {
    const response = await this.api.replies(markId);
    const doc = target.ownerDocument;
    target.replaceChildren();
    for (const reply of response.replies) {
      const item = doc.createElement('div');
      item.className = 'zsr-reply';
      const author = doc.createElement('span');
      author.className = 'zsr-reply-author';
      author.textContent = reply.authorName;
      const body = ZSRRichText.render(doc, reply.body);
      const mark = this.marks.find(candidate => candidate.id === markId);
      const ask = this.askCodexButton(doc, () => ({
        kind: 'reply', pageIndex: mark?.pageIndex,
        quote: mark?.quote, body: `${mark?.comment || ''}\n\n${reply.authorName}：${reply.body}`,
      }), item);
      item.append(author, body, ask);
      target.append(item);
    }
  }

  showCardError(card, error) {
    let element = card.querySelector('.zsr-error-message');
    if (!element) {
      element = card.ownerDocument.createElement('p');
      element.className = 'zsr-error-message';
      card.append(element);
    }
    element.textContent = error.message || String(error);
  }

  composePreview(doc, input) {
    const preview = doc.createElement('div');
    preview.className = 'zsr-compose-preview';
    preview.hidden = true;
    input.addEventListener('input', () => {
      const value = input.value.trim();
      preview.hidden = !value;
      if (value) preview.replaceChildren(ZSRRichText.render(doc, value));
      else preview.replaceChildren();
    });
    return preview;
  }

  async generateAI() {
    if (!this.documentId || !this.pdfPath) return;
    this.aiButton.disabled = true;
    this.setStatus('AI 正在阅读…');
    try {
      const result = await this.api.generate(this.documentId, this.pdfPath, this.ownerId);
      await this.reload();
      this.setStatus(`${result.drafts.length} 条私人 AI 草稿`);
    } catch (error) {
      this.setStatus('AI 阅读失败', true);
      this.log('AI reading failed', error);
    } finally { this.aiButton.disabled = false; }
  }

  onSelection({ doc, params, append }) {
    const annotation = params?.annotation;
    const text = String(annotation?.text || '').trim();
    const position = annotation?.position;
    if (!this.documentId || !text || !position?.rects?.length) return;
    const rects = Array.from(position.rects, rect => Array.from(rect, Number));
    const pageIndex = Number(position.pageIndex);
    if (!Number.isInteger(pageIndex)) return;
    this.ensureStyle(doc, 'zsr-toolbar-style', ZSRStyle.toolbar);
    this.ensureStyle(doc, 'zsr-rich-style', ZSRStyle.rich);
    const button = this.createButton(doc, '发表讨论', () => this.openComposer(doc, { text, pageIndex, rects }));
    button.className = 'zsr-selection-button';
    button.addEventListener('pointerdown', event => event.stopPropagation());
    append(button);
  }

  openComposer(doc, selection) {
    doc.querySelector('.zsr-composer')?.remove();
    const card = doc.createElement('div');
    card.className = 'zsr-composer';
    const close = this.createButton(doc, '×', () => card.remove());
    close.className = 'zsr-close';
    const title = doc.createElement('strong');
    title.textContent = '发表到公共讨论';
    const quote = doc.createElement('blockquote');
    quote.textContent = selection.text;
    const form = doc.createElement('form');
    const input = doc.createElement('textarea');
    input.placeholder = '写下你的想法；支持 Markdown 和 $LaTeX$，也可以只发表划线';
    input.maxLength = 5000;
    const preview = this.composePreview(doc, input);
    const submit = doc.createElement('button');
    submit.textContent = '确认公开发表';
    form.append(input, preview, submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      submit.disabled = true;
      try {
        await this.api.publish(this.documentId, {
          pageIndex: selection.pageIndex, rects: selection.rects,
          quote: selection.text, comment: input.value.trim(),
          authorName: this.authorName, ownerId: this.ownerId,
        });
        card.remove();
        await this.reload();
        this.onPublish?.(this.documentId, this);
        this.setStatus('已发表');
      } catch (error) { this.showCardError(card, error); submit.disabled = false; }
    });
    const ask = this.askCodexButton(doc, () => ({
      kind: 'comment', pageIndex: selection.pageIndex,
      quote: selection.text, body: input.value.trim(),
    }), card);
    card.append(title, close, quote, form, ask);
    doc.body.append(card);
    input.focus();
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.overlayTimer);
    clearTimeout(this.refreshTimer);
    clearInterval(this.pollTimer);
    this.observer?.disconnect();
    this.scrollTarget?.removeEventListener('scroll', this.onScroll, true);
    this.resizeWindow?.removeEventListener('resize', this.onScroll);
    this.innerDocument()?.querySelectorAll('.zsr-overlay, .zsr-popover, #zsr-page-style, #zsr-rich-style')
      .forEach(node => node.remove());
    this.outerDocument()?.querySelectorAll('.zsr-toolbar, .zsr-composer, #zsr-toolbar-style, #zsr-rich-style')
      .forEach(node => node.remove());
    this.guidePanel?.remove();
  }
};
