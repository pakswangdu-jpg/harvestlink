/**
 * Test Case ID: TC-011
 * Scenario    : Sign Up with Empty Complete Address and Zip Code
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
  searchAddressSuggestionsMock,
  navigateMock,
  setAuthPersistenceMock,
} = vi.hoisted(() => ({
  useStateMock: vi.fn(),
  useEffectMock: vi.fn(),
  useMemoMock: vi.fn((factory) => factory()),
  useRefMock: vi.fn(),
  registerMock: vi.fn(),
  checkContactNumberAvailabilityMock: vi.fn(),
  searchAddressSuggestionsMock: vi.fn(),
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

vi.mock('../../../src/services/placesService', () => ({
  createAutocompleteSessionToken: vi.fn(() => 'mock-session-token'),
  getPlaceDetails: vi.fn(),
  searchAddressSuggestions: searchAddressSuggestionsMock,
}));

vi.mock('../../../src/components/auth/recaptchaConfig', () => ({
  isRecaptchaConfigured: () => false,
}));

vi.mock('../../../src/components/auth/RecaptchaChallenge', () => ({ default: () => null }));
vi.mock('../../../src/components/common/BrandWordmark', () => ({ default: () => null }));
vi.mock('../../../src/components/common/AddressAutocomplete', () => ({
  default: (props) => ({ type: 'AddressAutocomplete', props }),
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
import FormField from '../../../src/components/common/FormField';
import { searchAddressSuggestions } from '../../../src/services/placesService';

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

describe('TC-011: Sign Up with Empty Complete Address and Zip Code', () => {
  const testCaseId = 'TC-011';
  const testDescription = 'Farmer selects Cebu City as farm location and leaves Complete Address and Zip Code empty.';
  const expectedResult =
    'System displays "Enter your complete address." and "Enter a valid 4-digit zip code.", prevents registration, and does not call the registration API.';

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

  it('displays address and zip code validation errors and prevents registration when both fields are empty', async () => {
    searchAddressSuggestionsMock.mockResolvedValue([
      { placeId: 'place-1', mainText: 'Talamban', secondaryText: 'Cebu City, Cebu', description: 'Talamban, Cebu City, Cebu' },
      { placeId: 'place-2', mainText: 'Lahug', secondaryText: 'Cebu City, Cebu', description: 'Lahug, Cebu City, Cebu' },
      { placeId: 'place-3', mainText: 'Banilad', secondaryText: 'Cebu City, Cebu', description: 'Banilad, Cebu City, Cebu' },
      { placeId: 'place-4', mainText: 'Mabolo', secondaryText: 'Cebu City, Cebu', description: 'Mabolo, Cebu City, Cebu' },
      { placeId: 'place-5', mainText: 'Guadalupe', secondaryText: 'Cebu City, Cebu', description: 'Guadalupe, Cebu City, Cebu' },
    ]);

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
      // 1. Verify mocked address suggestion service provides five available suggestions
      const suggestions = await searchAddressSuggestions('Cebu City');
      expect(suggestions).toHaveLength(5);

      // 2. Render AuthPage in register mode, select Farmer, and select Cebu City
      let nodes = renderWithHooks(AuthPage, { mode: 'register' }, store);
      const roleSelect = nodes.find((el) => el.props?.id === 'role');
      expect(roleSelect).toBeDefined();
      roleSelect.props.onChange({ target: { value: 'farmer' } });

      nodes = renderWithHooks(AuthPage, { mode: 'register' }, store);
      const municipalitySelect = nodes.find((el) => el.props?.id === 'municipality');
      expect(municipalitySelect).toBeDefined();
      municipalitySelect.props.onChange({ target: { value: 'Cebu City' } });

      // 3. Confirm Complete Address and Zip Code are empty and submit the registration form
      nodes = renderWithHooks(AuthPage, { mode: 'register' }, store);
      const addressInput = nodes.find((el) => el.props?.id === 'address');
      const zipCodeInput = nodes.find((el) => el.props?.id === 'zipCode');
      expect(addressInput.props.value).toBe('');
      expect(zipCodeInput.props.value).toBe('');

      const registerForm = nodes.find((el) => el.type === 'form' && typeof el.props?.onSubmit === 'function');
      expect(registerForm).toBeDefined();
      await registerForm.props.onSubmit({ preventDefault: vi.fn() });

      // 4. Verify validation messages appear for Complete Address and Zip Code
      nodes = renderWithHooks(AuthPage, { mode: 'register' }, store);
      const addressField = nodes.find((el) => el.type === FormField && el.props?.name === 'address');
      const zipCodeField = nodes.find((el) => el.type === FormField && el.props?.name === 'zipCode');

      expect(addressField).toBeDefined();
      expect(zipCodeField).toBeDefined();
      expect(addressField.props.error).toBe('Enter your complete address.');
      expect(zipCodeField.props.error).toBe('Enter a valid 4-digit zip code.');

      // 5. Verify registration is prevented and API is not called
      expect(registerMock).not.toHaveBeenCalled();
      expect(navigateMock).not.toHaveBeenCalled();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log(
        'Actual Result: With 5 mocked Cebu City address suggestions available and empty address/zip fields, form displayed "Enter your complete address." and "Enter a valid 4-digit zip code.", prevented registration, and did not call the registration API.',
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
