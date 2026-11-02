module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native(-community)?|react-native|expo|@expo|@tanstack|@react-native-async-storage)'
  ],
  setupFiles: ['<rootDir>/jest/env.js'],
  moduleNameMapper: {
    '^test-renderer$': '<rootDir>/node_modules/react-test-renderer',
  },
}
