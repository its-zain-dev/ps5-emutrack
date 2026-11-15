const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.angular',
  'dist',
  '.git',
  '.aistudio',
  '.playwright-cli',
  '.cache',
  'tmp',
  'data',
]);

const EXCLUDED_FILES = new Set([
  '.env',
  '.DS_Store',
  'Thumbs.db',
]);

const EXCLUDED_EXTENSIONS = ['.zip', '.log', '.tar', '.gz'];

export function shouldIncludeArchiveEntry(
  relativePosixPath: string,
  isDirectory: boolean,
): boolean {
  const normalized = relativePosixPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized === '.' || normalized === '..') {
    return false;
  }

  const segments = normalized.split('/');
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (!segment || segment === '.' || segment === '..') {
      return false;
    }
    const isLast = i === segments.length - 1;
    if (!isLast || isDirectory) {
      if (EXCLUDED_DIRS.has(segment)) {
        return false;
      }
    }
  }

  if (isDirectory) {
    return true;
  }

  const fileName = segments[segments.length - 1] ?? '';
  if (
    EXCLUDED_FILES.has(fileName) ||
    (fileName.startsWith('.env.') && fileName !== '.env.example')
  ) {
    return false;
  }

  const lower = fileName.toLowerCase();
  return !EXCLUDED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
