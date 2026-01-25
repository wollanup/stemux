# 🐛 Logger Utility

Custom logging system with configurable levels - keeps debug logs in dev, silent in production.

## 📖 Usage

```typescript
import { logger } from '@/utils/logger';

// Different log levels
logger.debug('🔁 Loop reached');      // Hidden in production
logger.info('✅ Track loaded');        // Hidden in production  
logger.warn('⚠️ Performance issue');  // Visible everywhere
logger.error('❌ Something broke!');   // Visible everywhere
```

## 🎚️ Log Levels

| Level | Dev | Production | Use Case |
|-------|-----|------------|----------|
| **DEBUG** | ✅ | ❌ | Development debugging, verbose logs |
| **INFO** | ✅ | ❌ | General information |
| **WARN** | ✅ | ✅ | Warnings, performance issues |
| **ERROR** | ✅ | ✅ | Errors, crashes |
| **NONE** | ❌ | ❌ | Silence everything |

## 🔧 Runtime Control

In development, the logger is exposed globally:

```javascript
// In browser console:
logger.setLevel('ERROR');  // Show only errors
logger.setLevel('DEBUG');  // Show everything
logger.getLevel();         // Check current level
```

## 🚀 Migration

### Option 1: Manual (Recommended)
Replace `console.log` with `logger.debug` as you go:

```diff
- console.log('🔁 Loop reached');
+ logger.debug('🔁 Loop reached');
```

Don't forget to import:
```typescript
import { logger } from '../utils/logger';
```

### Option 2: Automatic Script
Run the migration script to convert all at once:

```bash
cd app
node scripts/migrate-to-logger.cjs
```

This will:
- Replace `console.log` → `logger.debug`
- Replace `console.info` → `logger.info`  
- Add `logger` import where needed
- Keep `console.warn` and `console.error` unchanged

⚠️ **Always review changes** with `git diff` before committing!

## 💡 Best Practices

### Use DEBUG for:
- Function entry/exit logs
- State changes
- Event handlers firing
- Loop iterations

### Use INFO for:
- Successful operations
- Milestone events
- User actions

### Use WARN for:
- Performance issues
- Deprecation notices
- Recoverable errors

### Use ERROR for:
- Exceptions
- Fatal errors
- Unrecoverable states

## 🎯 Examples

```typescript
// ❌ Before
console.log('Creating loop from', start, 'to', end);
console.log('Track loaded:', track.name);
console.warn('Slow render detected');
console.error('Failed to load audio:', error);

// ✅ After
logger.debug('Creating loop from', start, 'to', end);
logger.info('Track loaded:', track.name);
logger.warn('Slow render detected');
logger.error('Failed to load audio:', error);
```

## 🏗️ Production Build

In production builds (`npm run build`):
- `logger.debug()` → **silenced** ✨
- `logger.info()` → **silenced** ✨
- `logger.warn()` → visible ⚠️
- `logger.error()` → visible ❌

Zero performance impact from debug logs in production!
