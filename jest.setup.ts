// Runs before every app test (npm test).

// SecureStore: an in-memory stand-in, emptied before each test.
jest.mock('expo-secure-store', () => {
  // Shared by every copy of this mock (jest.isolateModules loads a fresh copy).
  const g = globalThis as { mockSecureStore?: Map<string, string> };
  const store = (g.mockSecureStore ??= new Map<string, string>());
  return {
    __store: store,
    getItem: jest.fn((key: string) => store.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

beforeEach(() => {
  (jest.requireMock('expo-secure-store') as { __store: Map<string, string> }).__store.clear();
});

// Reanimated in tests: animations run on a fake clock (worklets load their plain-JS
// version through the resolver in package.json).
require('react-native-reanimated').setUpTests();
