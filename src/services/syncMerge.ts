interface Syncable {
  updatedAt?: number
}

export function resolveMerge<T extends Syncable>(
  local: T | undefined,
  remote: T | undefined,
): T | undefined {
  if (local === undefined) return remote
  if (remote === undefined) return local
  const localTime = local.updatedAt ?? 0
  const remoteTime = remote.updatedAt ?? 0
  return remoteTime > localTime ? remote : local
}
