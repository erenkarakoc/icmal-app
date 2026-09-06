'use client';

import { FileHandoverRouter } from '@features/projects/components/file-handover-router';
import { ProjectSessionProvider } from '@features/projects/components/project-session';
import { AppShell } from '@shared/components/app-shell';

export function ShellWrapper({ children }: { children: React.ReactNode }) {
  return <ProjectSessionProvider><FileHandoverRouter /><AppShell>{children}</AppShell></ProjectSessionProvider>;
}
