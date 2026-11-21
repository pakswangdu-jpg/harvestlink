/**
 * Test Case ID: TC-005
 * Scenario    : Login with Wrong Password
 * Route       : /login
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  useStateMock,
  useEffectMock,
  useMemoMock,
  useRefMock,
  loginMock,
  navigateMock,
  setAuthPersistenceMock,
} = vi.hoisted(() => ({
  useStateMock: vi.fn(),
  useEffectMock: vi.fn(),
  useMemoMock: vi.fn((factory) => factory()),
  useRefMock: vi.fn(),
  loginMock: vi.fn(),
  navigateMock: vi.fn(),
  setAuthPersistenceMock: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useState: useStateMock,
    useEffect: useEffectMock,
    useMemo: useMemoMock,
    useRef: useRefMock,
  };
});

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, className }) => ({ type: 'a', props: { href: to, className, children } }),
  Navigate: ({ to }) => ({ type: 'Navigate', props: { to } }),
  useLocation: () => ({ pathname: '/login', state: null }),
  useNavigate: () => navigateMock,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock('../../../src/features/auth/AuthContext', () => ({
  useAuth: () => ({
    currentUser: null,
    authLoading: false,
    login: loginMock,
    loginAdmin: vi.fn(),
    register: vi.fn(),
    verifyOtp: vi.fn(),
    resendOtp: vi.fn(),
  }),
}));

vi.mock('../../../src/lib/supabaseClient', () => ({
  setAuthPersistence: setAuthPersistenceMock,
}));

vi.mock('../../../src/services/authService', () => ({
  checkContactNumberAvailability: vi.fn(),
}));

vi.mock('../../../src/services/geocodeService', () => ({
  reverseGeocode: vi.fn(),
}));

vi.mock('../../../src/components/auth/recaptchaConfig', () => ({
  isRecaptchaConfigured: () => true,
}));

vi.mock('../../../src/components/auth/RecaptchaChallenge', () => ({
  default: ({ onTokenChange, onReadyChange, resetKey }) => ({
    type: 'RecaptchaChallenge',
    props: { onTokenChange, onReadyChange, resetKey },
  }),
}));

vi.mock('../../../src/components/common/BrandWordmark', () => ({ default: () => null }));
vi.mock('../../../src/components/common/AddressAutocomplete', () => ({ default: () => null }));
vi.mock('../../../src/components/common/Button', () => ({
  default: ({ children, ...rest }) => ({ type: 'button', props: { ...rest, children } }),
}));
vi.mock('../../../src/components/common/FormAlert', () => ({
  default: ({ type, title, message }) => ({ type: 'FormAlert', props: { type, title, message } }),
}));
vi.mock('../../../src/components/common/FormField', () => ({
  default: ({ children, label, name, error }) => ({ type: 'FormField', props: { label, name, error, children } }),
}));
vi.mock('../../../src/components/common/PasswordInput', () => ({
  default: (props) => ({ type: 'input', props: { ...props, type: 'password' } }),
}));

import AuthPage from '../../../src/features/auth/AuthPage';
import FormAlert from '../../../src/components/common/FormAlert';
import RecaptchaChallenge from '../../../src/components/auth/RecaptchaChallenge';

function createHookStore() {
  return { states: [], refs: [], effects: [] };
}

function depsChanged(prev, next) {
  if (!prev || !next || prev.length !== next.length) return true;
  return next.some((value, idx) => !Object.is(value, prev[idx]));
}

function collectElements(node, results = []) {
  if (!node || typeof node !== 'object') return results;
  if (Array.isArray(node)) {
    for (const item of node) collectElements(item, results);
    return results;
  }
  results.push(node);
  if (node.props?.children !== undefined) collectElements(node.props.children, results);
  return results;
}

describe('TC-005: Login with Wrong Password', () => {
  const testCaseId = 'TC-005';
  const testDescription = 'User enters janb@gmail.com with an incorrect password and verified reCAPTCHA.';
  const expectedResult =
    'System displays "Invalid email or password", keeps the user on /login, and denies dashboard access.';

  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    useMemoMock.mockImplementation((factory) => factory());

    const makeStorage = () => {
      const map = new Map();
      return {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: (key) => map.delete(key),
        clear: () => map.clear(),
      };
    };

    globalThis.localStorage = makeStorage();
    globalThis.sessionStorage = makeStorage();
    globalThis.window = {
      clearTimeout: vi.fn(),
      setTimeout: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
    globalThis.sessionStorage = originalSessionStorage;
  });

  it('denies login for janb@gmail.com with wrong password, displays "Invalid email or password", and stays on /login', async () => {
    const authError = new Error('Invalid login credentials');
    authError.code = 'INVALID_CREDENTIALS';
    authError.status = 401;
    loginMock.mockRejectedValue(authError);

    const renderWithHooks = (Component, props, store) => {
      let stateIdx = 0;
      let refIdx = 0;
      let effectIdx = 0;
      const pendingEffects = [];

      useStateMock.mockImplementation((initVal) => {
        const idx = stateIdx++;
        if (!(idx in store.states)) store.states[idx] = typeof initVal === 'function' ? initVal() : initVal;
        return [
          store.states[idx],
          (next) => {
            store.states[idx] = typeof next === 'function' ? next(store.states[idx]) : next;
          },
        ];
      });

      useRefMock.mockImplementation((initVal) => {
        const idx = refIdx++;
        if (!(idx in store.refs)) store.refs[idx] = { current: initVal };
        return store.refs[idx];
      });

      useEffectMock.mockImplementation((effectFn, deps) => {
        const idx = effectIdx++;
        const prev = store.effects[idx];
        if (!prev || depsChanged(prev.deps, deps)) {
          pendingEffects.push({ idx, effectFn, deps, prevCleanup: prev?.cleanup });
        }
      });

      const tree = Component(props);

      for (const eff of pendingEffects) {
        if (typeof eff.prevCleanup === 'function') eff.prevCleanup();
        const cleanup = eff.effectFn();
        store.effects[eff.idx] = { deps: eff.deps, cleanup };
      }

      return collectElements(tree);
    };

    const store = createHookStore();

    try {
      // 1. Render AuthPage in login mode
      let nodes = renderWithHooks(AuthPage, { mode: 'login' }, store);

      // 2. Enter janb@gmail.com, incorrect test password, and complete mocked reCAPTCHA
      const emailInput = nodes.find((el) => el.props?.id === 'email');
      const passwordInput = nodes.find((el) => el.props?.id === 'password');
      const recaptchaEl = nodes.find((el) => el.type === RecaptchaChallenge);

      expect(emailInput).toBeDefined();
      expect(passwordInput).toBeDefined();
      expect(recaptchaEl).toBeDefined();

      emailInput.props.onChange({ target: { value: 'janb@gmail.com' } });
      passwordInput.props.onChange({ target: { value: 'IncorrectPass123!' } });
      recaptchaEl.props.onReadyChange(true);
      recaptchaEl.props.onTokenChange('mock-verified-recaptcha-token');

      // 3. Submit the login form
      nodes = renderWithHooks(AuthPage, { mode: 'login' }, store);
      const loginForm = nodes.find((el) => el.type === 'form' && typeof el.props?.onSubmit === 'function');
      expect(loginForm).toBeDefined();

      await loginForm.props.onSubmit({ preventDefault: vi.fn() });

      // 4. Verify login API was called and rejected
      expect(loginMock).toHaveBeenCalledTimes(1);
      expect(loginMock).toHaveBeenCalledWith('janb@gmail.com', 'IncorrectPass123!', 'mock-verified-recaptcha-token');

      // 5. Verify "Invalid email or password" is displayed
      nodes = renderWithHooks(AuthPage, { mode: 'login' }, store);
      const errorAlert = nodes.find((el) => el.type === FormAlert && el.props?.type === 'error');
      expect(errorAlert).toBeDefined();
      expect(errorAlert.props.title).toBe('Invalid email or password');
      expect(errorAlert.props.message).toBe('The email or password you entered is incorrect. Please try again.');

      // 6. Verify user remains on /login and dashboard access is denied
      expect(navigateMock).not.toHaveBeenCalled();
      expect(nodes.some((el) => el.type === 'Navigate')).toBe(false);
      expect(nodes.find((el) => el.props?.id === 'email')).toBeDefined();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log(
        'Actual Result: Login failed for janb@gmail.com with wrong password, displayed "Invalid email or password", denied dashboard access, and kept user on /login.',
      );
      console.log('Outcome: PASSED');
    } catch (error) {
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log(`Actual Result: ${error.message}`);
      console.log('Outcome: FAILED');
      throw error;
    }
  });
});
