const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const POSTAL_CODE_PATTERN = /^\d{5}$/;
const ADDRESS_FIELDS = ['street', 'number', 'neighborhood', 'locality', 'state', 'postalCode'];
const REGISTRATION_FIELDS = new Set([
  'firstName', 'lastName', 'email', 'dateOfBirth', 'password', 'address', 'continueToCheckout',
]);
const PROFILE_FIELDS = new Set(['firstName', 'lastName', 'email', 'dateOfBirth', 'address', 'currentPassword']);
const PASSWORD_CHANGE_FIELDS = new Set(['currentPassword', 'newPassword']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function dateInMexicoCity(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
}

function validateDateOfBirth(value, errors, today) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    errors.dateOfBirth = 'Escribe una fecha de nacimiento válida.';
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    errors.dateOfBirth = 'Escribe una fecha de nacimiento válida.';
    return false;
  }

  const todayDate = dateInMexicoCity(today);
  if (value > todayDate) {
    errors.dateOfBirth = 'La fecha de nacimiento no puede estar en el futuro.';
    return false;
  }
  const [birthYear, birthMonth, birthDay] = value.split('-').map(Number);
  const [currentYear, currentMonth, currentDay] = todayDate.split('-').map(Number);
  const age = currentYear - birthYear
    - (currentMonth < birthMonth || (currentMonth === birthMonth && currentDay < birthDay) ? 1 : 0);
  if (age < 18) {
    errors.dateOfBirth = 'Debes tener al menos 18 años.';
    return false;
  }
  return true;
}

function personName(value, field, errors) {
  const name = normalizeText(value);
  if (name.length < 2) errors[field] = field === 'firstName' ? 'Escribe tu nombre.' : 'Escribe tus apellidos.';
  else if (name.length > 120) errors[field] = 'El campo no puede superar 120 caracteres.';
  return name;
}

function emailAddress(value, errors) {
  const email = normalizeEmail(value);
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) errors.email = 'Escribe un correo electrónico válido.';
  return email;
}

function hasUnexpectedFields(input, allowed) {
  return Object.keys(input).some((key) => !allowed.has(key));
}

function validateAddress(value, errors, requireAll) {
  if (!isRecord(value)) {
    errors.address = 'Completa tu dirección.';
    return undefined;
  }
  const address = {};
  const labels = {
    street: 'Escribe la calle.', number: 'Escribe el número exterior.',
    neighborhood: 'Escribe la colonia.', locality: 'Escribe la ciudad o delegación.',
    state: 'Escribe el estado.', postalCode: 'Escribe el código postal.',
  };
  for (const field of ADDRESS_FIELDS) {
    const text = normalizeText(value[field]);
    if (!text) {
      if (requireAll) errors[`address.${field}`] = labels[field];
      continue;
    }
    if (text.length > 120) {
      errors[`address.${field}`] = 'El campo no puede superar 120 caracteres.';
      continue;
    }
    if (field === 'postalCode' && !POSTAL_CODE_PATTERN.test(text)) {
      errors['address.postalCode'] = 'Escribe un código postal de cinco dígitos.';
      continue;
    }
    address[field] = text;
  }
  if (Object.keys(value).some((key) => !ADDRESS_FIELDS.includes(key))) {
    errors['address.input'] = 'La dirección contiene campos no permitidos.';
  }
  if (!requireAll && Object.keys(address).length === 0 && Object.keys(value).length === 0) {
    errors['address.input'] = 'Actualiza al menos un campo de dirección.';
  }
  return address;
}

export function validateRegistrationInput(input, today = new Date()) {
  if (!isRecord(input)) return { success: false, errors: { input: 'La solicitud no es válida.' } };
  const errors = {};
  if (hasUnexpectedFields(input, REGISTRATION_FIELDS)) errors.input = 'La solicitud contiene campos no permitidos.';
  if (typeof input.continueToCheckout !== 'undefined' && typeof input.continueToCheckout !== 'boolean') {
    errors.continueToCheckout = 'La continuación de compra no es válida.';
  }

  const firstName = personName(input.firstName, 'firstName', errors);
  const lastName = personName(input.lastName, 'lastName', errors);
  const email = emailAddress(input.email, errors);
  const password = typeof input.password === 'string' ? input.password : '';
  if (password.length < 12) errors.password = 'La contraseña debe tener al menos 12 caracteres.';
  else if (password.length > 128) errors.password = 'La contraseña no puede superar 128 caracteres.';
  validateDateOfBirth(input.dateOfBirth, errors, today);
  const address = validateAddress(input.address, errors, true);

  if (Object.keys(errors).length) return { success: false, errors };
  return {
    success: true,
    data: {
      firstName, lastName, email, dateOfBirth: input.dateOfBirth, password,
      continueToCheckout: input.continueToCheckout === true, address,
    },
  };
}

export function validateProfileInput(input, today = new Date()) {
  if (!isRecord(input)) return { success: false, errors: { input: 'La solicitud no es válida.' } };
  const errors = {};
  if (hasUnexpectedFields(input, PROFILE_FIELDS)) errors.input = 'La solicitud contiene campos no permitidos.';
  if (Object.keys(input).length === 0) errors.input = 'Actualiza al menos un campo.';

  const data = {};
  if ('firstName' in input) data.firstName = personName(input.firstName, 'firstName', errors);
  if ('lastName' in input) data.lastName = personName(input.lastName, 'lastName', errors);
  if ('email' in input) data.email = emailAddress(input.email, errors);
  if ('dateOfBirth' in input) {
    validateDateOfBirth(input.dateOfBirth, errors, today);
    data.dateOfBirth = input.dateOfBirth;
  }
  if ('address' in input) data.address = validateAddress(input.address, errors, false);
  if ('currentPassword' in input) {
    if (typeof input.currentPassword !== 'string' || input.currentPassword.length === 0) {
      errors.currentPassword = 'Confirma tu contraseña actual.';
    } else if (input.currentPassword.length > 128) {
      errors.currentPassword = 'La contraseña actual no es válida.';
    } else data.currentPassword = input.currentPassword;
  }
  return Object.keys(errors).length ? { success: false, errors } : { success: true, data };
}

export function validatePasswordChangeInput(input) {
  if (!isRecord(input)) return { success: false, errors: { input: 'La solicitud no es válida.' } };
  const errors = {};
  if (hasUnexpectedFields(input, PASSWORD_CHANGE_FIELDS)) errors.input = 'La solicitud contiene campos no permitidos.';
  const currentPassword = typeof input.currentPassword === 'string' ? input.currentPassword : '';
  const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
  if (!currentPassword) errors.currentPassword = 'Escribe tu contraseña actual.';
  else if (currentPassword.length > 128) errors.currentPassword = 'La contraseña actual no es válida.';
  if (newPassword.length < 12) errors.newPassword = 'La contraseña debe tener al menos 12 caracteres.';
  else if (newPassword.length > 128) errors.newPassword = 'La contraseña no puede superar 128 caracteres.';
  return Object.keys(errors).length
    ? { success: false, errors }
    : { success: true, data: { currentPassword, newPassword } };
}
