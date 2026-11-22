// Reads and validates environment variables once, at startup. Fails fast with a clear message.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name}. See .env.example.`);
    process.exit(1);
  }
  return value;
}

const jwtSecret = required('JWT_SECRET');
if (Buffer.byteLength(jwtSecret, 'utf8') < 32) {
  console.error('JWT_SECRET must be at least 32 bytes long.');
  process.exit(1);
}

/**
 * pg treats sslmode=require as verify-full today (certificate checked), but warns that its next
 * major version will switch to libpq's weaker meaning. Pin today's strict behaviour explicitly.
 */
const strictSsl = (url: string): string => url.replace(/([?&])sslmode=require(?=&|$)/, '$1sslmode=verify-full');

export const config = Object.freeze({
  env: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: strictSsl(required('DATABASE_URL')),
  jwtSecret: new TextEncoder().encode(jwtSecret),
  // Render sets RENDER_GIT_COMMIT automatically; the pipeline uses it to confirm a deploy is live.
  commit: process.env.RENDER_GIT_COMMIT ?? 'local',
});
