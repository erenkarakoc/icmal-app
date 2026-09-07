'use client';

import { CostEstimateView } from '@features/cost-estimate/components/cost-estimate-view';

/**
 * Local workspace. This route is deliberately absent from the protected list in
 * `src/shared/lib/supabase/middleware.ts`, so it stays reachable without a
 * session or a network connection; local `.icmal` files are handled entirely by
 * the desktop main process. Catalogue search inside the table still needs the
 * network and fails on its own when offline, which does not block editing.
 */
export default function YerelPage() {
  return <CostEstimateView />;
}
