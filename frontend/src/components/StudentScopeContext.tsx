import { createContext, useContext } from 'react';
import type { ApiSubject } from '../api/types';

export type StudentScope = {
  subjects: ApiSubject[];
  selectedSubjectId: number | null;
  selectedSubject: ApiSubject | null;
  setSelectedSubjectId: (subjectId: number) => void;
  loading: boolean;
};

export const StudentScopeContext = createContext<StudentScope | null>(null);
export const useStudentScope = () => useContext(StudentScopeContext);
