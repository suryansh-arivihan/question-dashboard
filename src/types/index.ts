// Question status types
export type QuestionStatus = "VERIFIED" | "PENDING" | "IN_PROGRESS";

// DynamoDB table interfaces
export interface ExamChapterTopicMapping {
  topic_id: string;
  exam: string;
  chapter: string;
  chapter_code: string;
  chapter_display_name: string;
  createdAt: string;
  subject: string;
  topic: string;
  topicNumber: number;
  topic_display_name: string;
  numberOfQuestions?: number;
  VerifiedLevel1?: number;
  VerifiedLevel2?: number;
  VerifiedLevel3?: number;
}

export interface QuestionRecord {
  PrimaryKey: string;
  question_id: string;
  status: QuestionStatus;
  subject: string;
  chapter_name: string;
  identified_topic: string;
  difficulty_level: number;
}

export interface GenerationQueueEntry {
  id: string;
  subject: string;
  chapter_name: string;
  topic_name: string;
  topic_id: string;
  triggered_by: string;
  timestamp: number;
  status: "QUEUED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  createdAt: number;
  updatedAt: number;
  summary?: {
    level_1?: LevelSummary;
    level_2?: LevelSummary;
    level_3?: LevelSummary;
    level_4?: LevelSummary;
    level_5?: LevelSummary;
  };
}

export interface LevelSummary {
  level: number;
  status: string;
  existing_count: number;
  needed_count: number;
  generated_count: number;
  reason?: string | null;
  error?: string | null;
}

// API response interfaces
export interface TopicStats {
  name: string;
  display_name: string;
  total: number;
  verified: number;
  pending: number;
  in_progress: number;
  verifiedLevel1?: number;
  verifiedLevel2?: number;
  verifiedLevel3?: number;
}

export interface ChapterStats {
  name: string;
  display_name: string;
  total: number;
  verified: number;
  pending: number;
  in_progress: number;
  topics: TopicStats[];
}

export interface SubjectStats {
  name: string;
  total: number;
  verified: number;
  pending: number;
  in_progress: number;
  chapters: ChapterStats[];
}

export interface StatsResponse {
  subjects: SubjectStats[];
}

export interface ReadyToGoRequest {
  subject: string;
  chapter: string;
  topic: string;
  topicId: string;
}

export interface ReadyToGoResponse {
  success: boolean;
  queueId: string;
  message: string;
}

export interface InviteCodeRequest {
  inviteCode: string;
}

export interface InviteCodeResponse {
  valid: boolean;
}
