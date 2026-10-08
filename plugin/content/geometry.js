var ZSRGeometry = (() => {
  function transformPoint(matrix, x, y) {
    const [a, b, c, d, e, f] = matrix;
    return [a * x + c * y + e, b * x + d * y + f];
  }

  function inversePoint(matrix, x, y) {
    const [a, b, c, d, e, f] = matrix;
    const determinant = a * d - b * c;
    if (!determinant) throw new Error('PDF viewport has no inverse');
    const px = x - e;
    const py = y - f;
    return [(d * px - c * py) / determinant, (-b * px + a * py) / determinant];
  }

  function mappedBox(rect, transform) {
    const [x1, y1, x2, y2] = rect;
    const points = [transform(x1, y1), transform(x1, y2), transform(x2, y1), transform(x2, y2)];
    return [
      Math.min(...points.map(point => point[0])), Math.min(...points.map(point => point[1])),
      Math.max(...points.map(point => point[0])), Math.max(...points.map(point => point[1])),
    ];
  }

  function pdfToCss(rect, matrix) {
    return mappedBox(rect, (x, y) => transformPoint(matrix, x, y));
  }

  function cssToPdf(rect, matrix) {
    return mappedBox(rect, (x, y) => inversePoint(matrix, x, y));
  }

  // PDF.js text spans are fragmented by layout. Match without whitespace while
  // preserving character positions so a DOM Range can recover the exact boxes.
  function findQuoteRects(page, quote) {
    const layer = page.querySelector('.textLayer');
    if (!layer || !quote) return [];
    const target = String(quote).normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase();
    if (target.length < 8) return [];
    let haystack = '';
    const positions = [];
    for (const span of layer.querySelectorAll('span')) {
      const node = span.firstChild;
      if (!node || node.nodeType !== 3) continue;
      for (let offset = 0; offset < node.textContent.length; offset++) {
        const normalized = node.textContent[offset].normalize('NFKC').toLocaleLowerCase();
        for (const char of normalized) {
          if (/\s/u.test(char)) continue;
          haystack += char;
          positions.push({ node, offset });
        }
      }
    }
    const index = haystack.indexOf(target);
    if (index < 0) return [];
    const first = positions[index];
    const last = positions[index + target.length - 1];
    const range = page.ownerDocument.createRange();
    range.setStart(first.node, first.offset);
    range.setEnd(last.node, last.offset + 1);
    const pageBox = page.getBoundingClientRect();
    return [...range.getClientRects()].filter(box => box.width > 1 && box.height > 1).map(box => [
      box.left - pageBox.left, box.top - pageBox.top,
      box.right - pageBox.left, box.bottom - pageBox.top,
    ]);
  }

  return { pdfToCss, cssToPdf, findQuoteRects };
})();
