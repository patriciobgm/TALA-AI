export interface ApiPracticeQuestion {
  id: number;
  prompt: string;
  question_type: 'mcq' | 'tf' | 'short';
  options: string[];
  position: number;
  provenance?: 'extracted' | 'ai' | 'manual';
  source_locator?: string;
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
  recommendation_reason?: string;
  recommendation_metadata?: { score?: number; confidence?: string; algorithm_version?: string; latest_score?: number | null; score_band?: string };
}

export interface ApiPlan { id: number; student: number; competency: number; competency_title: string; baseline_score: string; status: string; created_at: string; activities: ApiActivity[]; mastery_assessment: { id: number; title: string; available: boolean; remaining_activities: number; availability_reason: string } | null }
export interface CompetencyResult { id: number; competency: number; competency_title: string; subject: number; subject_name: string; score: string; status: string }
export interface AssessmentAttempt { id: number; assessment: number; student: number; submitted_at: string; score: string; competency_results: CompetencyResult[]; incorrect_question_ids: number[] }
export interface StudentDashboardData { academic_class: { id: number; label: string; subject_name: string | null; class_code: string | null } | null; mastered: number; total_competencies: number; plans: ApiPlan[]; attempts: AssessmentAttempt[]; pending_diagnostic: { id: number; title: string; question_count: number; due_at: string | null; remaining_prerequisites: number; prerequisite_titles: string[] } | null }
export interface ApiQuestion { id: number; competency: number; competency_title?: string; prompt: string; question_type: 'mcq' | 'tf' | 'short'; options: string[]; correct_answer?: string }
export interface ApiAssessment { id: number; title: string; subject: number; kind: 'pre' | 'post' | 'remedial'; instructions: string; due_at: string | null; is_active: boolean; available: boolean; availability_reason: string; remaining_activities: number; remaining_prerequisites: number; consent_status?: string; assigned_classes: number[]; prerequisite_assignments: number[]; created_by: number; question_count: number; competency_ids: number[]; questions?: ApiQuestion[] }
export interface ApiLearner { id: number; name: string; email: string; section: string; progress: number; gaps: number; assessment: number | null; status: 'On track' | 'Monitor' | 'Intervention' }
export interface MaterialAnalytics {
  summary: { materials: number; assigned_learners: number; in_progress: number; completed: number; quiz_passed: number };
  materials: { id: number; title: string; resource_type: string; purpose: 'regular' | 'prerequisite' | 'recovery' | 'enrichment'; quiz_question_count: number; assigned: number; not_started: number; in_progress: number; completed: number; quiz_attempted: number; quiz_passed: number; average_quiz_score: number | null }[];
  learners: { assignment_id: number; material: string; resource_type: string; student_id: number; student: string; section: string; status: 'not_started' | 'in_progress' | 'completed'; progress_percent: number; latest_quiz_score: number | null; quiz_passed: boolean; attempt_count: number; last_activity_at: string | null }[];
}
export interface LearnerEvidence { id: number; competency: number; competency_title: string; subject: number; subject_name: string; evidence_type: string; evidence_type_label: string; score: string | null; summary: string; details: Record<string, unknown>; occurred_at: string }
export interface LearningRecommendation { plan: number; competency: number; competency_title: string; resource: number; resource_title: string; resource_type: string; difficulty: string; score: number; confidence: 'high' | 'medium' | 'limited'; reason: string; signals: { algorithm_version: string; latest_score: number | null; practice_average: number | null; practice_attempts: number; score_band: string; embedded_checks: number; previous_resource_score: number | null } }
export interface LearnerDetail { student: { id: number; name: string; email: string; section: string }; plans: ApiPlan[]; attempts: AssessmentAttempt[]; evidence: LearnerEvidence[]; interventions: { id: number; action: string; note: string; created_at: string }[]; guardians: { id: number; name: string; relationship: string; phone: string; email: string }[]; remedial_exams: { id: number; title: string; eligible: boolean; eligibility_status: 'not_recommended' | 'recommended' | 'eligible' | 'exempted' | 'completed'; eligibility_reason: string; remaining_activities: number; consent_status: 'not_requested' | 'requested' | 'approved' | 'declined' | 'revoked' | 'expired'; guardian_name: string; requested_at: string | null; evidence_attached: boolean }[]; recommendations: LearningRecommendation[] }

export interface ApiSubject { id: number; name: string; code: string; grade_level: number; is_active: boolean; competency_count: number }
export interface ApiCompetency { id: number; subject: number; code: string; title: string; mastery_threshold: number; is_active: boolean }
export interface ApiClass { id: number; name: string; grade_level: number; school_year: string; is_active: boolean; class_code: string | null; label: string; student_count: number; teacher_count: number }

export interface ExtractedQuestion {
  source_number: number;
  prompt: string;
  question_type: 'mcq' | 'tf' | 'short';
  options: string[];
  correct_answer: string;
  competency_id: number | null;
  competency_code: string;
  confidence: 'high' | 'needs_review';
  provenance?: 'extracted' | 'ai' | 'manual';
  source_locator?: string;
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
  extracted_payload: { questions?: ExtractedQuestion[]; question_count?: number; practice_questions?: ExtractedQuestion[]; practice_question_count?: number; description?: string; transcription_status?: 'not_configured' | 'completed'; transcript_character_count?: number; quiz_generation_status?: 'extracted' | 'not_attempted' | 'ai_generated' | 'unavailable'; quiz_provider?: string; quiz_model?: string; quiz_generation_error?: string };
  error_message: string;
  published_assessment: number | null;
  published_assessment_title: string | null;
  published_resource: number | null;
  published_resource_title: string | null;
  uploaded_by: number;
  uploaded_by_name: string;
  uploaded_by_email: string;
  archived_by: number | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearningAssignment {
  id: number;
  resource: number;
  resource_title: string;
  resource_type: 'module' | 'video' | 'lesson' | 'example' | 'exercise';
  purpose: 'regular' | 'prerequisite' | 'recovery' | 'enrichment';
  resource_content: string;
  original_filename: string;
  competency: { id: number; code: string; title: string } | null;
  file_url: string;
  uploaded_by_name: string;
  assigned_classes: number[];
  class_labels: string[];
  instructions: string;
  due_at: string | null;
  is_active: boolean;
  opened_at: string | null;
  completed_at: string | null;
  playback_position_seconds: number;
  duration_seconds: number;
  progress_percent: number;
  practice_questions: ApiPracticeQuestion[];
  quiz_required: boolean;
  quiz_passed: boolean;
  latest_quiz_score: string | null;
  created_at: string;
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
