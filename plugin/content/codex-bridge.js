var ZSRCodexBridge = {
  prompt({ title, pageIndex, quote, body, kind }) {
    const label = kind === 'guide' ? 'AI 导读批注' : kind === 'reply' ? '读者回复' :
      kind === 'draft' ? 'AI 评论草稿' : '读者讨论';
    const lines = [
      '请结合当前打开的论文，回答我对下面段落和讨论的疑问。区分论文原文、其他读者观点与自己的推断；必要时指出不确定之处。',
      `论文：${String(title || '未命名论文').slice(0, 400)}`,
    ];
    if (Number.isInteger(pageIndex) && pageIndex >= 0) lines.push(`PDF 第 ${pageIndex + 1} 页`);
    if (quote) lines.push(`论文原文摘录：\n> ${String(quote).slice(0, 2000).replace(/\n/gu, '\n> ')}`);
    if (body) lines.push(`${label}：\n${String(body).slice(0, 5000)}`);
    lines.push('请用中文解释核心概念和公式，并说明这条讨论是否准确。');
    return lines.join('\n\n');
  },

  async prepare(reader, discussion) {
    const bridge = Zotero.CodexSidebar?.prepareExternalDraft;
    if (Zotero.CodexSidebar?.externalDraftVersion !== 1 || typeof bridge !== 'function') {
      throw new Error('请安装或启用支持讨论联动的 Codex 侧栏插件');
    }
    const attachmentID = Number(reader?.itemID);
    if (!Number.isSafeInteger(attachmentID) || attachmentID <= 0) {
      throw new Error('无法识别当前 PDF');
    }
    const prompt = this.prompt(discussion);
    return bridge(attachmentID, prompt, String(reader.tabID || ''));
  },
};
