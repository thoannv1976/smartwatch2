import { requireRolePage } from '@/server/auth/guards';

/** Instructor area: assignments, monitoring, leaderboards and export (spec 9.3). */
export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  await requireRolePage('INSTRUCTOR', '/instructor');
  return <>{children}</>;
}
