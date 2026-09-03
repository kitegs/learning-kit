import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs'

export type FileValidator = (data: Uint8Array) => void

export interface ValidFile {
  path: string
  data: Uint8Array
  invalidPaths: string[]
}

function writeDurably(path: string, data: Uint8Array): void {
  const fd = openSync(path, 'w')
  try {
    writeSync(fd, data)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

export function atomicReplaceFile(
  targetPath: string,
  data: Uint8Array,
  validate: FileValidator,
  backupPath = `${targetPath}.last-good.bak`
): void {
  const tempPath = `${targetPath}.tmp`
  writeDurably(tempPath, data)
  validate(readFileSync(tempPath))

  if (existsSync(targetPath)) {
    const current = readFileSync(targetPath)
    validate(current)
    const backupTempPath = `${backupPath}.tmp`
    writeDurably(backupTempPath, current)
    validate(readFileSync(backupTempPath))
    renameSync(backupTempPath, backupPath)
  }

  renameSync(tempPath, targetPath)
}

export function firstValidFile(paths: string[], validate: FileValidator): ValidFile | null {
  const invalidPaths: string[] = []
  for (const path of paths) {
    if (!existsSync(path)) continue
    const data = readFileSync(path)
    try {
      validate(data)
      return { path, data, invalidPaths }
    } catch {
      invalidPaths.push(path)
    }
  }
  return null
}
