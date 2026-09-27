import { EnrollmentPanel } from '../components/EnrollmentPanel';
import { PageHeader } from '../components/PageHeader';

export function StudentEnrollmentPage() {
  return <>
    <PageHeader title="Subject enrollment" description="Enter the code shared by your teacher. Your cluster, grade level, and section are checked before the teacher reviews your request." />
    <EnrollmentPanel role="student" />
  </>;
}
