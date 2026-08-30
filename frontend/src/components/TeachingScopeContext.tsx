import { createContext, useContext } from 'react';
import type { ApiClass, ApiSubject } from '../api/types';

export type TeachingScope = {
  subjects: ApiSubject[];
  classes: ApiClass[];
  selectedSubjectId: number | null;
  selectedSubject: ApiSubject | null;
  setSelectedSubjectId: (subjectId: number) => void;
};

export const TeachingScopeContext = createContext<TeachingScope | null>(null);
export const useTeachingScope = () => useContext(TeachingScopeContext);
