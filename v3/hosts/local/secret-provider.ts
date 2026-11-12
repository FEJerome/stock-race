/**
 * 凭据只经此处在 composition root 读取注入；不进 AST/快照/日志/provenance/错误消息。
 */
export function readSecretFromEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required secret env var: ${name}`);
  }
  return value;
}
