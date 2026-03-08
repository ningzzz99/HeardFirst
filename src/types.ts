export type UserRole = 'student' | 'teacher' | 'parent';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  class_id?: string;
  parent_id?: string;
}

export interface ClassInfo {
  id: string;
  name: string;
  teacher_id: string;
}

export interface AISuggestion {
  text: string;
  image: string;
}

export interface EmotionLog {
  id?: string;
  student_id: string;
  student_name?: string;
  emotion: string;
  reason: string;
  reason_prompt: string;
  ai_suggestions: { text: string; prompt: string }[];
  help_requested: boolean;
  resolved: boolean;
  resolvedAt?: string;
  timestamp: any; // Firestore timestamp
}

export interface EmotionOption {
  id: string;
  label: string;
  emoji: string;
  color: string;
}
