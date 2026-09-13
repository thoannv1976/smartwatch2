import { requireRolePage } from '@/server/auth/guards';

/** Admin area: users, courses and engine configuration (spec 9.3). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRolePage('ADMIN', '/admin');
  return <>{children}</>;
}
