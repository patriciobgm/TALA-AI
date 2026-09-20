import { EnrollmentPanel } from '../components/EnrollmentPanel';
import { PageHeader } from '../components/PageHeader';

export function StudentEnrollmentPage() {
  return <>
    <PageHeader title="Subject enrollment" description="Browse subjects available for your cluster, grade level, and section. Your assigned teacher reviews each request." />
    <EnrollmentPanel role="student" />
  </>;
}
