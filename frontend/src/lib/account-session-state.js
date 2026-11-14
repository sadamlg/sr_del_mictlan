import { AccountApiError, accountRequest } from './account-api.js';

export async function loadAccountSession(request = accountRequest) {
  try {
    const { account } = await request('auth/session');
    return { status: 'account', account, error: '' };
  } catch (error) {
    if (error instanceof AccountApiError && error.status === 401) {
      return { status: 'guest', account: null, error: '' };
    }
    return {
      status: 'error',
      account: null,
      error: error instanceof Error ? error.message : 'No se pudo consultar la sesión.',
    };
  }
}
