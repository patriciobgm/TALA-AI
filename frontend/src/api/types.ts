export interface ApiActivity { id: number; title: string; position: number; completed_at: string | null; resource: number | null; resource_title?: string; resource_type?: string; content?: string }
export interface ApiPlan { id: number; student: number; competency: number; competency_title: string; baseline_score: string; status: string; created_at: string; activities: ApiActivity[] }
export interface CompetencyResult { id: number; competency: number; competency_title: string; score: string; status: string }
export interface AssessmentAttempt { id: number; assessment: number; student: number; submitted_at: string; score: string; competency_results: CompetencyResult[] }
export interface StudentDashboardData { mastered: number; total_competencies: number; plans: ApiPlan[]; attempts: AssessmentAttempt[] }
export interface ApiQuestion { id: number; competency: number; prompt: string; question_type: 'mcq' | 'tf'; options: string[] }
export interface ApiAssessment { id: number; title: string; subject: number; kind: 'pre' | 'post'; is_active: boolean; available: boolean; question_count: number; questions?: ApiQuestion[] }
export interface ApiLearner { id: number; name: string; email: string; section: string; progress: number; gaps: number; assessment: number | null; status: 'On track' | 'Monitor' | 'Intervention' }
export interface LearnerDetail { student: { id: number; name: string; email: string; section: string }; plans: ApiPlan[]; attempts: AssessmentAttempt[]; interventions: { id: number; action: string; note: string; created_at: string }[] }
