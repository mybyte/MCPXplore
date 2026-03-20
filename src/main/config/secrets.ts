import { safeStorage } from 'electron'

const ENC_PREFIX = 'enc:'

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function encryptSecret(plain: string): string {
  if (!plain) return plain
  if (!isEncryptionAvailable()) return plain
  const buf = safeStorage.encryptString(plain)
  return ENC_PREFIX + buf.toString('base64')
}

export function decryptSecret(value: string): string {
  if (!value || !value.startsWith(ENC_PREFIX)) return value
  const b64 = value.slice(ENC_PREFIX.length)
  const buf = Buffer.from(b64, 'base64')
  return safeStorage.decryptString(buf)
}
