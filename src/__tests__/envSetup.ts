// Runs before any module loads (Jest setupFiles). dotenv.config() in env.ts
// will not override these because dotenv never overwrites existing vars.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-access-secret-key-for-testing';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

process.env.STORAGE_DRIVER = 'local';
process.env.LOCAL_UPLOAD_DIR = 'uploads-test';
process.env.LOG_DIR = 'logs-test';

// Disable the ML face-match so tests don't download models.
process.env.FACE_MATCH_ENABLED = 'false';
