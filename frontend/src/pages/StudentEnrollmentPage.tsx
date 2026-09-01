import { EnrollmentPanel } from '../components/EnrollmentPanel';
import { PageHeader } from '../components/PageHeader';

export function StudentEnrollmentPage() {
  return <>
    <PageHeader title="Subject enrollment" description="Request access to an ARAL subject using the code shared by its teacher." />
    <EnrollmentPanel role="student" />
  </>;
}
