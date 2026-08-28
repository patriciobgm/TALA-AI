export interface ApiPracticeQuestion {
  id: number;
  prompt: string;
  question_type: 'mcq' | 'tf' | 'short';
  options: string[];
  position: number;
}

export interface ApiPracticeFeedback {
  question_id: number;
  student_answer: string;
  correct_answer: string;
  is_correct: boolean;
  explanation: string;
}

export interface ApiActivity {
  id: number;
  title: string;
  position: number;
  due_at: string | null;
  completed_at: string | null;
  resource: number | null;
  resource_title?: string;
  resource_type?: 'lesson' | 'example' | 'exercise' | 'module' | 'video';
  content?: string;
  file_url?: string;
  practice_questions?: ApiPracticeQuestion[];
  passing_score?: number;
  review?: { answers: Record<string, string>; score: string; completed_at: string; feedback: ApiPracticeFeedback[] } | null;
}

export interface ApiPlan { id: number; student: number; competency: number; competency_title: string; baseline_score: string; status: string; created_at: string; activities: ApiActivity[]; mastery_assessment: { id: number; title: string; available: boolean; remaining_activities: number; availability_reason: string } | null }
export interface CompetencyResult { id: number; competency: number; competency_title: string; score: string; status: string }
export interface AssessmentAttempt { id: number; assessment: number; student: number; submitted_at: string; score: string; competency_results: CompetencyResult[] }
export interface StudentDashboardData { mastered: number; total_competencies: number; plans: ApiPlan[]; attempts: AssessmentAttempt[] }
export interface ApiQuestion { id: number; competency: number; competency_title?: string; prompt: string; question_type: 'mcq' | 'tf' | 'short'; options: string[]; correct_answer?: string }
export interface ApiAssessment { id: number; title: string; subject: number; kind: 'pre' | 'post'; instructions: string; due_at: string | null; is_active: boolean; available: boolean; availability_reason: string; remaining_activities: number; assigned_classes: number[]; created_by: number; question_count: number; competency_ids: number[]; questions?: ApiQuestion[] }
export interface ApiLearner { id: number; name: string; email: string; section: string; progress: number; gaps: number; assessment: number | null; status: 'On track' | 'Monitor' | 'Intervention' }
export interface LearnerDetail { student: { id: number; name: string; email: string; section: string }; plans: ApiPlan[]; attempts: AssessmentAttempt[]; interventions: { id: number; action: string; note: string; created_at: string }[] }

export interface ApiSubject { id: number; name: string; code: string; is_active: boolean; competency_count: number }
export interface ApiCompetency { id: number; subject: number; code: string; title: string; mastery_threshold: number; is_active: boolean }
export interface ApiClass { id: number; name: string; grade_level: number; school_year: string; is_active: boolean; label: string; student_count: number; teacher_count: number }

export interface ExtractedQuestion {
  source_number: number;
  prompt: string;
  question_type: 'mcq' | 'tf' | 'short';
  options: string[];
  correct_answer: string;
  competency_id: number | null;
  competency_code: string;
  confidence: 'high' | 'needs_review';
}

export interface ContentImport {
  id: number;
  title: string;
  kind: 'exam' | 'module' | 'video';
  source_file_url: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  subject: number;
  competency: number | null;
  status: 'uploaded' | 'processing' | 'needs_review' | 'published' | 'failed' | 'rejected';
  configuration: Record<string, unknown>;
  extracted_text: string;
  extracted_payload: { questions?: ExtractedQuestion[]; question_count?: number; description?: string };
  error_message: string;
  published_assessment: number | null;
  published_assessment_title: string | null;
  published_resource: number | null;
  published_resource_title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiNotification {
  id: number;
  kind: string;
  title: string;
  message: string;
  action_url: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}
