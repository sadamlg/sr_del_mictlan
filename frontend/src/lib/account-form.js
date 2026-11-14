export function validateRegistrationForm(input) {
  const errors = {};
  const required = ['firstName', 'lastName', 'email', 'dateOfBirth', 'password', 'street', 'number', 'neighborhood', 'locality', 'state', 'postalCode'];
  for (const field of required) {
    if (typeof input?.[field] !== 'string' || input[field].trim() === '') errors[field] = 'Completa este campo.';
  }
  if (input?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) errors.email = 'Escribe un correo válido.';
  if (input?.postalCode && !/^\d{5}$/.test(input.postalCode.trim())) errors.postalCode = 'Escribe los cinco dígitos del código postal.';
  if (input?.password && (input.password.length < 12 || input.password.length > 128)) errors.password = 'Usa entre 12 y 128 caracteres.';
  if (input?.dateOfBirth && !toIsoMexicanDate(input.dateOfBirth)) errors.dateOfBirth = 'Escribe la fecha como día/mes/año.';
  return errors;
}

export function hasFormChanges(initial, current) {
  return Object.keys(current).some((key) => {
    if (key === 'address') return Object.keys(current.address || {}).some((field) => current.address[field] !== initial?.address?.[field]);
    return current[key] !== initial?.[key];
  });
}

export function isOpaqueTokenShape(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function toIsoMexicanDate(value) {
  if (typeof value !== 'string') return '';
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return '';
  const [, day, month, year] = match;
  const isoDate = `${year}-${month}-${day}`;
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== isoDate ? '' : isoDate;
}

export function fromIsoMexicanDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}
