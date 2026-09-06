import path from 'node:path';

// The shell hands over the two document types the app owns.
export const HANDOVER_KINDS = {'.icmal': 'icmal', '.ekap': 'ekap'} as const;

export type HandoverKind = (typeof HANDOVER_KINDS)[keyof typeof HANDOVER_KINDS];

export function handoverKind(target: string): HandoverKind | null {
  return HANDOVER_KINDS[path.extname(target).toLowerCase() as keyof typeof HANDOVER_KINDS] ?? null;
}

// Windows and Linux pass a double-clicked file as a bare argument. The argument
// list also carries the executable and Electron/Chromium switches, and in
// development it carries the script path, so match on the extension rather than
// on a fixed position.
export function documentPathFromArgv(argv: string[]): string | null {
  const candidate = argv.slice(1).find((arg) => !arg.startsWith('-') && handoverKind(arg));
  return candidate ? path.resolve(candidate) : null;
}
