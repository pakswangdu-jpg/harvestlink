import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const authServiceSource = await readFile(new URL('../../../src/services/authService.js', import.meta.url), 'utf8');
const adminAuthServiceSource = await readFile(new URL('../../../src/services/adminAuthService.js', import.meta.url), 'utf8');
const validatorsSource = await readFile(new URL('../../../src/utils/validators.js', import.meta.url), 'utf8');
const authDestinationSource = await readFile(new URL('../../../src/utils/authDestination.js', import.meta.url), 'utf8');

async function loadValidatorsModule() {
  const context = vm.createContext({ Error, Number, String, Date, File: class File {} });
  const mod = new vm.SourceTextModule(validatorsSource, { context });
  await mod.link((specifier) => {
    if (specifier === './unitConversion') {
      return new vm.SyntheticModule(['getFixedKgPerUnit', 'hasFixedConversion'], function () {
        this.setExport('getFixedKgPerUnit', () => null);
        this.setExport('hasFixedConversion', () => false);
      }, { context });
    }
    if (specifier === './philippineMobile') {
      return new vm.SyntheticModule(['isValidPhilippineMobile'], function () {
        this.setExport('isValidPhilippineMobile', () => true);
      }, { context });
    }
    if (specifier === '../../backend/shared/pricing.js') {
      return new vm.SyntheticModule(['getWholesalePricingErrors'], function () {
        this.setExport('getWholesalePricingErrors', () => ({}));
      }, { context });
    }
    if (specifier === '../../backend/shared/location.js') {
      return new vm.SyntheticModule(['hasAcceptableRegistrationLocation', 'MAX_REGISTRATION_LOCATION_ACCURACY_METERS'], function () {
        this.setExport('hasAcceptableRegistrationLocation', () => true);
        this.setExport('MAX_REGISTRATION_LOCATION_ACCURACY_METERS', 500);
      }, { context });
    }
    throw new Error(`Unexpected validators specifier: ${specifier}`);
  });
  await mod.evaluate();
  return mod.namespace;
}

async function loadAuthDestinationModule() {
  const context = vm.createContext({});
  const mod = new vm.SourceTextModule(authDestinationSource, { context });
  await mod.link((specifier) => {
    if (specifier === './constants') {
      return new vm.SyntheticModule(['ROLE_DASHBOARDS'], function () {
        this.setExport('ROLE_DASHBOARDS', {
          farmer: '/farmer-dashboard',
          buyer: '/buyer-dashboard',
          stakeholder: '/stakeholder-dashboard',
          admin: '/admin-dashboard',
        });
      }, { context });
    }
    throw new Error(`Unexpected authDestination specifier: ${specifier}`);
  });
  await mod.evaluate();
  return mod.namespace;
}

const validatorsNamespace = await loadValidatorsModule();
const authDestinationNamespace = await loadAuthDestinationModule();

export const { validateAuthForm, hasErrors } = validatorsNamespace;
export const { getAuthDestination, ADMIN_ENTRY_PATH } = authDestinationNamespace;

export async function createLoginUserHarness({
  loginResponse = { session: { access_token: 'access-token', refresh_token: 'refresh-token' } },
  loginError = null,
  profileResponse = { id: 'user-1', role: 'farmer', accountStatus: 'active' },
  profileError = null,
  setSessionResult = { data: { session: { user: { id: 'user-1' } } }, error: null },
} = {}) {
  const events = [];
  const supabaseMock = {
    auth: {
      async setSession(session) {
        events.push({ type: 'setSession', session });
        return setSessionResult;
      },
      async signOut(options) {
        events.push({ type: 'signOut', options });
        return { error: null };
      },
      async getUser() {
        return { data: { user: { id: profileResponse?.id || 'user-1' } } };
      },
    },
  };

  const apiClientMock = {
    async post(path, body) {
      events.push({ type: 'apiPost', path, body });
      if (loginError) throw loginError;
      return loginResponse;
    },
    async get(path, options) {
      events.push({ type: 'apiGet', path, options });
      if (path === '/profiles/me') {
        if (profileError) throw profileError;
        return profileResponse;
      }
      throw new Error(`Unexpected GET path: ${path}`);
    },
  };

  const context = vm.createContext({ Error, encodeURIComponent });
  const mod = new vm.SourceTextModule(authServiceSource, { context });
  await mod.link((specifier) => {
    if (specifier === '../lib/supabaseClient') {
      return new vm.SyntheticModule(['supabase'], function () {
        this.setExport('supabase', supabaseMock);
      }, { context });
    }
    if (specifier === './apiClient') {
      return new vm.SyntheticModule(['apiClient'], function () {
        this.setExport('apiClient', apiClientMock);
      }, { context });
    }
    if (specifier === './uploadService') {
      return new vm.SyntheticModule(['uploadAccreditationFile', 'uploadGovIdFile'], function () {
        this.setExport('uploadAccreditationFile', async () => null);
        this.setExport('uploadGovIdFile', async () => null);
      }, { context });
    }
    if (specifier === '../utils/fetchAdminUserLocations') {
      return new vm.SyntheticModule(['fetchAllAdminUserLocations'], function () {
        this.setExport('fetchAllAdminUserLocations', async () => []);
      }, { context });
    }
    throw new Error(`Unexpected specifier: ${specifier}`);
  });
  await mod.evaluate();
  return { loginUser: mod.namespace.loginUser, events };
}

export async function createAdminLoginHarness({
  loginResponse = { session: { access_token: 'admin-access-token', refresh_token: 'admin-refresh-token' } },
  loginError = null,
  adminAccessResult = { allowed: true },
  adminAccessError = null,
  profileResponse = { id: 'admin-1', role: 'admin', accountStatus: 'active' },
  profileError = null,
  setSessionResult = { data: { session: { user: { id: 'admin-1' } } }, error: null },
} = {}) {
  const events = [];
  const supabaseMock = {
    auth: {
      async setSession(session) {
        events.push({ type: 'setSession', session });
        return setSessionResult;
      },
      async signOut(options) {
        events.push({ type: 'signOut', options });
        return { error: null };
      },
    },
  };

  const apiClientMock = {
    async post(path, body) {
      events.push({ type: 'apiPost', path, body });
      if (loginError) throw loginError;
      return loginResponse;
    },
    async get(path, options) {
      events.push({ type: 'apiGet', path, options });
      if (path === '/auth/admin-access') {
        if (adminAccessError) throw adminAccessError;
        return adminAccessResult;
      }
      if (path === '/profiles/me') {
        if (profileError) throw profileError;
        return profileResponse;
      }
      throw new Error(`Unexpected GET path: ${path}`);
    },
  };

  const context = vm.createContext({ Error });
  const mod = new vm.SourceTextModule(adminAuthServiceSource, { context });
  await mod.link((specifier) => {
    if (specifier === '../lib/supabaseClient') {
      return new vm.SyntheticModule(['supabase'], function () {
        this.setExport('supabase', supabaseMock);
      }, { context });
    }
    if (specifier === './apiClient') {
      return new vm.SyntheticModule(['apiClient'], function () {
        this.setExport('apiClient', apiClientMock);
      }, { context });
    }
    throw new Error(`Unexpected specifier: ${specifier}`);
  });
  await mod.evaluate();
  return { loginAdmin: mod.namespace.loginAdmin, events };
}
