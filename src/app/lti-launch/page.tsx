import { LtiLaunchClient } from '@/components/lti/LtiLaunchClient';

export const metadata = { title: 'Moodle — Smartwatch CEO Challenge' };

/** Entry point for launches from the LMS through UniGame Hub (/lti-launch#ticket=…). */
export default function LtiLaunchPage() {
  return <LtiLaunchClient />;
}
