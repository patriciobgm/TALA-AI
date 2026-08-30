import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from './api';
import type { Subject } from './types';

const SUBJECT_KEY = 'tala_student_subject';
type StudentScopeValue = { subjects: Subject[]; selectedSubjectId: number | null; selectedSubject: Subject | null; setSelectedSubjectId: (id: number) => void; loading: boolean };
const StudentScopeContext = createContext<StudentScopeValue | null>(null);

export function StudentScopeProvider({ children }: { children: ReactNode }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectIdState] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    Promise.all([api<{ subjects: Subject[] }>('/dashboard/student/context/'), SecureStore.getItemAsync(SUBJECT_KEY)]).then(([context, stored]) => {
      if (!active) return;
      const storedId = Number(stored) || null;
      setSubjects(context.subjects);
      setSelectedSubjectIdState(storedId && context.subjects.some(item => item.id === storedId) ? storedId : context.subjects[0]?.id ?? null);
    }).catch(() => { if (active) { setSubjects([]); setSelectedSubjectIdState(null); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const value = useMemo<StudentScopeValue>(() => ({
    subjects,
    selectedSubjectId,
    selectedSubject: subjects.find(item => item.id === selectedSubjectId) ?? null,
    setSelectedSubjectId: id => { setSelectedSubjectIdState(id); void SecureStore.setItemAsync(SUBJECT_KEY, String(id)); },
    loading,
  }), [loading, selectedSubjectId, subjects]);
  return <StudentScopeContext.Provider value={value}>{children}</StudentScopeContext.Provider>;
}

export function useStudentScope() {
  const context = useContext(StudentScopeContext);
  if (!context) throw new Error('useStudentScope must be used inside StudentScopeProvider.');
  return context;
}
