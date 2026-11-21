/**
 * Test Case ID: TC-009
 * Scenario    : Farmer Sign Up with Invalid Contact Number
 * Route       : /register
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  useStateMock,
  useEffectMock,
  useMemoMock,
  useRefMock,
  registerMock,
  checkContactNumberAvailabilityMock,
  navigateMock,
  setAuthPersistenceMock,
} = vi.hoisted(() => ({
  useStateMock: vi.fn(),
  useEffectMock: vi.fn(),
  useMemoMock: vi.fn((factory) => factory()),
  useRefMock: vi.fn(),
  registerMock: vi.fn(),
  checkContactNumberAvailabilityMock: vi.fn(),
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
  useLocation: () => ({ pathname: '/register', state: null }),
  useNavigate: () => navigateMock,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock('../../../src/features/auth/AuthContext', () => ({
  useAuth: () => ({
    currentUser: null,
    authLoading: false,
    login: vi.fn(),
    loginAdmin: vi.fn(),
    register: registerMock,
    verifyOtp: vi.fn(),
    resendOtp: vi.fn(),
  }),
}));

vi.mock('../../../src/lib/supabaseClient', () => ({
  setAuthPersistence: setAuthPersistenceMock,
}));

vi.mock('../../../src/services/authService', () => ({
  checkContactNumberAvailability: checkContactNumberAvailabilityMock,
}));

vi.mock('../../../src/services/geocodeService', () => ({
  reverseGeocode: vi.fn(),
}));

vi.mock('../../../src/components/auth/recaptchaConfig', () => ({
  isRecaptchaConfigured: () => false,
}));

vi.mock('../../../src/components/auth/RecaptchaChallenge', () => ({ default: () => null }));
vi.mock('../../../src/components/common/BrandWordmark', () => ({ default: () => null }));
vi.mock('../../../src/components/common/AddressAutocomplete', () => ({
  default: (props) => ({ type: 'input', props }),
}));
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

function extractText(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object') {
    if (typeof node.type === 'function') return extractText(node.type(node.props));
    if (node.props?.children !== undefined) return extractText(node.props.children);
  }
  return '';
}

describe('TC-009: Farmer Sign Up with Invalid Contact Number', () => {
  const testCaseId = 'TC-009';
  const testDescription = 'Farmer enters an invalid contact number (123123123) during sign up.';
  const expectedResult =
    'System displays "Please enter a valid Philippine mobile number.", marks the contact number field with an error state, prevents registration, and does not call the registration API.';

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

  it('shows "Please enter a valid Philippine mobile number." for 123123123 and prevents Farmer registration', async () => {
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
      // 1. Render AuthPage in register mode and select Farmer account type
      let nodes = renderWithHooks(AuthPage, { mode: 'register' }, store);
      const roleSelect = nodes.find((el) => el.props?.id === 'role');
      expect(roleSelect).toBeDefined();
      roleSelect.props.onChange({ target: { value: 'farmer' } });

      // 2. Enter "123123123" as the contact number and trigger blur validation
      nodes = renderWithHooks(AuthPage, { mode: 'register' }, store);
      let phoneEl = nodes.find((el) => typeof el.type === 'function' && el.props?.id === 'contactNumber');
      expect(phoneEl).toBeDefined();
      phoneEl.props.onChange('123123123');

      nodes = renderWithHooks(AuthPage, { mode: 'register' }, store);
      phoneEl = nodes.find((el) => typeof el.type === 'function' && el.props?.id === 'contactNumber');
      await phoneEl.props.onBlur();

      // 3. Submit the registration form
      nodes = renderWithHooks(AuthPage, { mode: 'register' }, store);
      const registerForm = nodes.find((el) => el.type === 'form' && typeof el.props?.onSubmit === 'function');
      expect(registerForm).toBeDefined();
      await registerForm.props.onSubmit({ preventDefault: vi.fn() });

      // 4. Verify contact number field displays error state and exact validation message
      nodes = renderWithHooks(AuthPage, { mode: 'register' }, store);
      phoneEl = nodes.find((el) => typeof el.type === 'function' && el.props?.id === 'contactNumber');
      expect(phoneEl.props.error).toBe('Please enter a valid Philippine mobile number.');

      const phoneTree = collectElements(phoneEl.type(phoneEl.props));
      const phoneInput = phoneTree.find((el) => el.type === 'input' && el.props?.id === 'contactNumber');
      const validationMsg = phoneTree.find((el) => el.props?.className === 'phone-validation-message invalid');
      expect(phoneInput.props.className).toBe('is-invalid');
      expect(validationMsg).toBeDefined();
      expect(extractText(validationMsg)).toContain('Please enter a valid Philippine mobile number.');

      // 5. Verify registration is prevented and APIs are not called
      expect(checkContactNumberAvailabilityMock).not.toHaveBeenCalled();
      expect(registerMock).not.toHaveBeenCalled();
      expect(navigateMock).not.toHaveBeenCalled();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log(
        'Actual Result: Contact number field for Farmer sign up (123123123) entered error state (className="is-invalid"), displayed "Please enter a valid Philippine mobile number.", prevented registration, and did not call the registration API.',
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
