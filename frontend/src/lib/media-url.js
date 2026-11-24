const SAFE_KEY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function mediaOrigin(mediaBaseUrl) {
  const baseUrl = typeof mediaBaseUrl === 'string' ? mediaBaseUrl.trim() : '';
  if (!baseUrl) return null;

  let parsedBaseUrl;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    return null;
  }

  if (parsedBaseUrl.protocol !== 'https:' || parsedBaseUrl.username || parsedBaseUrl.password || parsedBaseUrl.search || parsedBaseUrl.hash) {
    return null;
  }

  return parsedBaseUrl.origin;
}

function isPrivateIpv4(hostname) {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;
  return first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
}

function validateKey(key) {
  if (typeof key !== 'string' || key.length === 0 || key.startsWith('/')) {
    throw new Error('La clave relativa del medio no es válida.');
  }

  const segments = key.split('/');
  if (segments.some((segment) => !SAFE_KEY_SEGMENT.test(segment) || segment === '.' || segment === '..')) {
    throw new Error('La clave relativa del medio no es válida.');
  }

  return segments.map(encodeURIComponent).join('/');
}

export function mediaObjectUrl(mediaBaseUrl, key, { allowInsecureDevHttp = process.env.NODE_ENV === 'development' } = {}) {
  const objectKey = validateKey(key);
  const baseUrl = typeof mediaBaseUrl === 'string'
    ? mediaBaseUrl.replace(/\/+$/, '')
    : '';

  if (!baseUrl) return `/${objectKey}`;

  let parsedBaseUrl;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new Error('MEDIA_BASE_URL debe ser una URL absoluta válida.');
  }

  if (parsedBaseUrl.username || parsedBaseUrl.password) {
    throw new Error('MEDIA_BASE_URL no puede incluir credenciales.');
  }
  if (parsedBaseUrl.search || parsedBaseUrl.hash) {
    throw new Error('MEDIA_BASE_URL solo puede contener un origen y una ruta base.');
  }

  const isInsecureDevOrigin = allowInsecureDevHttp && parsedBaseUrl.protocol === 'http:' &&
    (parsedBaseUrl.hostname === 'localhost' || parsedBaseUrl.hostname === '127.0.0.1' || parsedBaseUrl.hostname === '[::1]' || isPrivateIpv4(parsedBaseUrl.hostname));
  if (parsedBaseUrl.protocol !== 'https:' && !isInsecureDevOrigin) {
    throw new Error('MEDIA_BASE_URL debe usar HTTPS, excepto para localhost o una IPv4 privada en desarrollo.');
  }

  const basePath = parsedBaseUrl.pathname.replace(/\/+$/, '');
  const objectPath = `${basePath}/${objectKey}`;
  if (isInsecureDevOrigin) {
    return objectPath;
  }

  return `${parsedBaseUrl.origin}${objectPath}`;
}

export function mediaRenditionUrl(sourceUrl, width) {
  if (typeof sourceUrl !== 'string' || !sourceUrl || !Number.isSafeInteger(width) || width <= 0) {
    throw new Error('La URL o el ancho de la variante de imagen no son válidos.');
  }

  const isAbsoluteUrl = /^https?:\/\//i.test(sourceUrl);
  let url;
  try {
    url = new URL(sourceUrl, 'https://relative-media.invalid');
  } catch {
    throw new Error('La URL de la imagen no es válida.');
  }

  const pathWithRendition = url.pathname.replace(/\.([A-Za-z0-9]+)$/, `-${width}.webp`);
  if (pathWithRendition === url.pathname) {
    throw new Error('La imagen debe tener una extensión reconocida para crear una variante.');
  }

  if (isAbsoluteUrl) {
    url.pathname = pathWithRendition;
    return url.toString();
  }

  return `${pathWithRendition}${url.search}${url.hash}`;
}

export function mediaRenditionSrcSet(sourceUrl, widths, sourceWidth) {
  if (!Array.isArray(widths) || widths.length === 0 || widths.some((width) => !Number.isSafeInteger(width) || width <= 0)) {
    throw new Error('La lista de anchos de variantes de imagen no es válida.');
  }

  if (sourceWidth !== undefined && (!Number.isSafeInteger(sourceWidth) || sourceWidth <= 0)) {
    throw new Error('El ancho de la imagen original no es válido.');
  }

  const candidates = [...new Set(widths)].map((width) => ({
    width,
    url: mediaRenditionUrl(sourceUrl, width),
  }));

  if (sourceWidth && !candidates.some(({ width }) => width === sourceWidth)) {
    candidates.push({ width: sourceWidth, url: sourceUrl });
  }

  return candidates
    .sort((first, second) => first.width - second.width)
    .map(({ width, url }) => `${url} ${width}w`)
    .join(', ');
}
