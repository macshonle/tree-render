import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default tseslint.config(
  // Ignore patterns
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'src/vite-env.d.ts'],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Vue recommended rules (includes vue parser)
  ...pluginVue.configs['flat/recommended'],

  // Browser environment globals
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },

  // Configure Vue files to use TypeScript parser
  {
    files: ['*.vue', '**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },

  // Project-specific rules
  {
    rules: {
      // Allow unused vars prefixed with underscore
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Vue specific
      'vue/multi-word-component-names': 'off',
      // Allow lexical declarations in case blocks (common pattern)
      'no-case-declarations': 'off',
    },
  }
)
