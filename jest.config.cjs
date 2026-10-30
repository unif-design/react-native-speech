module.exports = {
  preset: '@react-native/jest-preset',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.[jt]s?(x)'],
  moduleNameMapper: {
    '^@unif/react-native-speech$': '<rootDir>/src/index.ts',
    '^@unif/react-native-speech/(credentials|realtime|capture|input)$':
      '<rootDir>/src/$1/index.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native[a-z-]*|@react-native|@unif|react-native-url-polyfill|whatwg-url-without-unicode)/)',
  ],
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/index*.ts'],
};
