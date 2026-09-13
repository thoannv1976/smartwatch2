import { SimTestClient } from '@/components/simtest/SimTestClient';

export const metadata = { title: 'Simulation test — Smartwatch CEO Challenge' };

/**
 * Internal simulation test mode (spec 14.1). Protected from students: the
 * layout in this route group requires the INSTRUCTOR or ADMIN role.
 */
export default function SimTestPage() {
  return <SimTestClient />;
}
