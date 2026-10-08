import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../plugin/content/geometry.js', import.meta.url), 'utf8');
const geometry = runInNewContext(`${source}\nZSRGeometry;`);

test('PDF rectangles survive viewport rotation and inverse mapping', () => {
  const pdfRect = [100, 200, 200, 220];
  for (const transform of [
    [2, 0, 0, -2, 0, 1584],
    [0, 2, 2, 0, 0, 0],
    [-2, 0, 0, 2, 1224, 0],
  ]) {
    const viewportRect = geometry.pdfToCss(pdfRect, transform);
    const roundTrip = geometry.cssToPdf(viewportRect, transform);
    assert.deepEqual(Array.from(roundTrip).map(Math.round), pdfRect);
  }
});
