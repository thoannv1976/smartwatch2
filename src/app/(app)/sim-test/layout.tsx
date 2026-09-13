import { requireRolePage } from '@/server/auth/guards';

/** Internal simulation test mode is protected from normal students (spec 14.1). */
export default async function SimTestLayout({ children }: { children: React.ReactNode }) {
  await requireRolePage('INSTRUCTOR', '/sim-test');
  return <>{children}</>;
}
