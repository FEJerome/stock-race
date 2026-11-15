/**
 * Credentials are read and injected only here at the composition root; they
 * never enter an AST/snapshot/log/provenance/error message.
 */
export function readSecretFromEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required secret env var: ${name}`);
  }
  return value;
}
