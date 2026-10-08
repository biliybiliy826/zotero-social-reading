export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function requiredString(value, name, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new ApiError(400, `${name} must be a non-empty string of at most ${max} characters`);
  }
  return value.trim();
}

export function optionalString(value, name, max) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new ApiError(400, `${name} is invalid`);
  return value.trim();
}

export function sha256(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new ApiError(400, 'sha256 must be a lowercase PDF digest');
  }
  return value;
}

export function uuid(value, name = 'id') {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value)) {
    throw new ApiError(400, `${name} must be a UUID`);
  }
  return value;
}

export function normalizeDOI(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.length > 200) throw new ApiError(400, 'doi is invalid');
  const doi = value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '').toLowerCase();
  if (!/^10\.\d{4,9}\/.+$/u.test(doi)) throw new ApiError(400, 'doi is invalid');
  return doi;
}

export function position(body) {
  const index = pageIndex(body?.pageIndex);
  const rects = body?.rects;
  if (!Array.isArray(rects) || rects.length < 1 || rects.length > 30 || !rects.every(
    rect => Array.isArray(rect) && rect.length === 4 && rect.every(n => Number.isFinite(n) && n >= -100 && n <= 10_000)
      && rect[2] > rect[0] && rect[3] > rect[1],
  )) throw new ApiError(400, 'rects must contain PDF-space rectangles');
  return { pageIndex: index, rects };
}

export function pageIndex(value) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new ApiError(400, 'pageIndex is invalid');
  }
  return value;
}
