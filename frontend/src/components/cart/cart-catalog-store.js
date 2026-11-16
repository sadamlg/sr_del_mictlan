const listeners = new Set();
const serverCatalog = Object.freeze({});
let catalog = serverCatalog;

export function getCartCatalogSnapshot() {
  return catalog;
}

export function getServerCartCatalogSnapshot() {
  return serverCatalog;
}

export function subscribeToCartCatalog(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerCartProduct(product) {
  if (!product?.slug || catalog[product.slug] === product) return;
  catalog = { ...catalog, [product.slug]: product };
  listeners.forEach((listener) => listener());
}
