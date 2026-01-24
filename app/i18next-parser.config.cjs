module.exports = {
  // Locales to support
  locales: ['en', 'fr'],
  
  // Output directory for locale files
  output: 'src/i18n/locales/$LOCALE.json',
  
  // Input files to scan for translations
  input: 'src/**/*.{ts,tsx}',
  
  // Key separator (e.g., 'app.title')
  keySeparator: '.',
  
  // Namespace separator (disabled, we use single namespace)
  nsSeparator: false,
  
  // Default namespace
  defaultNamespace: 'translation',
  
  // Default value for missing keys
  defaultValue: (locale, namespace, key) => key,
  
  // Keep removed keys in JSON files (false = auto-cleanup)
  keepRemoved: false,
  
  // Sort keys alphabetically
  sort: true,
  
  // Create old catalog backup
  createOldCatalogs: false,
  
  // Indentation for JSON files
  indentation: 2,
  
  // Fail on warnings
  failOnWarnings: false,
  
  // Verbose output
  verbose: true,
};
