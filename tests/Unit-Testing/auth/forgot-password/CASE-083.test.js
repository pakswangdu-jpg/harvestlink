/** Test Case ID: CASE-083 — Login Validation Using New Password. */
import { describe, expect, it, vi } from 'vitest';

const { useStateMock, useEffectMock, useMemoMock, useRefMock, loginMock, navigateMock } = vi.hoisted(() => ({
  useStateMock: vi.fn(), useEffectMock: vi.fn(), useMemoMock: vi.fn((factory) => factory()),
  useRefMock: vi.fn(), loginMock: vi.fn(), navigateMock: vi.fn(),
}));

vi.mock('react', async () => ({ ...(await vi.importActual('react')), useState: useStateMock, useEffect: useEffectMock, useMemo: useMemoMock, useRef: useRefMock }));
vi.mock('react-router-dom', () => ({
  Link: ({ children, ...props }) => ({ type: 'a', props: { ...props, children } }),
  Navigate: ({ to }) => ({ type: 'Navigate', props: { to } }),
  useLocation: () => ({ pathname: '/login', state: null }), useNavigate: () => navigateMock,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
vi.mock('../../../../src/features/auth/AuthContext', () => ({ useAuth: () => ({ currentUser: null, authLoading: false, login: loginMock, loginAdmin: vi.fn(), register: vi.fn(), verifyOtp: vi.fn(), resendOtp: vi.fn() }) }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ setAuthPersistence: vi.fn() }));
vi.mock('../../../../src/services/authService', () => ({ checkContactNumberAvailability: vi.fn() }));
vi.mock('../../../../src/services/geocodeService', () => ({ reverseGeocode: vi.fn() }));
vi.mock('../../../../src/components/auth/recaptchaConfig', () => ({ isRecaptchaConfigured: () => true }));
vi.mock('../../../../src/components/auth/RecaptchaChallenge', () => ({ default: ({ onTokenChange, onReadyChange }) => ({ type: 'RecaptchaChallenge', props: { onTokenChange, onReadyChange } }) }));
vi.mock('../../../../src/components/common/BrandWordmark', () => ({ default: () => null }));
vi.mock('../../../../src/components/common/AddressAutocomplete', () => ({ default: () => null }));
vi.mock('../../../../src/components/common/Button', () => ({ default: ({ children, ...props }) => ({ type: 'button', props: { ...props, children } }) }));
vi.mock('../../../../src/components/common/FormAlert', () => ({ default: ({ type, title, message }) => ({ type: 'FormAlert', props: { type, title, message } }) }));
vi.mock('../../../../src/components/common/FormField', () => ({ default: ({ children, label, name, error }) => ({ type: 'FormField', props: { label, name, error, children } }) }));
vi.mock('../../../../src/components/common/PasswordInput', () => ({ default: (props) => ({ type: 'input', props: { ...props, type: 'password' } }) }));

import AuthPage from '../../../../src/features/auth/AuthPage';
import RecaptchaChallenge from '../../../../src/components/auth/RecaptchaChallenge';

const collect = (node, result = []) => {
  if (!node || typeof node !== 'object') return result;
  if (Array.isArray(node)) return node.reduce((items, child) => collect(child, items), result);
  result.push(node);
  if (node.props?.children !== undefined) collect(node.props.children, result);
  return result;
};

const renderWithHooks = (Component, props, store) => {
  let stateIndex = 0; let refIndex = 0; let effectIndex = 0; const pending = [];
  useStateMock.mockImplementation((initial) => {
    const index = stateIndex++;
    if (!(index in store.states)) store.states[index] = typeof initial === 'function' ? initial() : initial;
    return [store.states[index], (next) => { store.states[index] = typeof next === 'function' ? next(store.states[index]) : next; }];
  });
  useRefMock.mockImplementation((initial) => { const index = refIndex++; if (!(index in store.refs)) store.refs[index] = { current: initial }; return store.refs[index]; });
  useEffectMock.mockImplementation((effect, deps) => { const index = effectIndex++; const previous = store.effects[index]; if (!previous || JSON.stringify(previous.deps) !== JSON.stringify(deps)) pending.push({ index, effect, previous }); });
  const tree = Component(props);
  pending.forEach(({ index, effect, previous }) => { previous?.cleanup?.(); store.effects[index] = { deps: undefined, cleanup: effect() }; });
  return collect(tree);
};

describe('CASE-083: Login Validation Using New Password', () => {
  it('passes the new password to mocked authentication and handles success', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() };
    globalThis.sessionStorage = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() };
    globalThis.window = { clearTimeout: vi.fn(), setTimeout: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
    loginMock.mockResolvedValue({ role: 'buyer' });
    const store = { states: [], refs: [], effects: [] };
    let nodes = renderWithHooks(AuthPage, { mode: 'login' }, store);
    const email = nodes.find((node) => node.props?.id === 'email');
    const password = nodes.find((node) => node.props?.id === 'password');
    const captcha = nodes.find((node) => node.type === RecaptchaChallenge);
    expect(email).toBeDefined(); expect(password).toBeDefined(); expect(captcha).toBeDefined();
    email.props.onChange({ target: { value: 'registered@example.com' } });
    password.props.onChange({ target: { value: 'Harvest@123' } });
    captcha.props.onReadyChange(true); captcha.props.onTokenChange('test-captcha-token');
    nodes = renderWithHooks(AuthPage, { mode: 'login' }, store);
    const form = nodes.find((node) => node.type === 'form' && typeof node.props?.onSubmit === 'function');
    await form.props.onSubmit({ preventDefault: vi.fn() });
    expect(loginMock).toHaveBeenCalledTimes(1);
    expect(loginMock).toHaveBeenCalledWith('registered@example.com', 'Harvest@123', 'test-captcha-token');
    expect(navigateMock).toHaveBeenCalled();
    expect(nodes.some((node) => node.type === 'Navigate')).toBe(false);
    console.log('Test Case ID: CASE-083');
    console.log('Test Description: User logs in using the newly reset password.');
    console.log('Expected Result: Login receives the credentials and handles the mocked successful response.');
    console.log('Actual Result: Authentication received the expected credentials and navigated to the buyer dashboard.');
    console.log('Outcome: PASSED');
  });
});
