import { AppHeader } from '@/components/chrome/AppHeader';
import { requireUserPage } from '@/server/auth/guards';

/**
 * Shell for every signed-in screen. Authentication is enforced here once, so no
 * page inside this group can be reached anonymously.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage();

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader role={user.role} displayName={user.displayName} />
      <div className="flex-1">{children}</div>
      <footer className="border-t border-ink-800 px-4 py-4 text-center text-xs text-ink-500">
        Benchmark brands are educational strategic archetypes. Their in-game statistics are
        simulated teaching values, not real market shares, financial results or live product data.
      </footer>
    </div>
  );
}
