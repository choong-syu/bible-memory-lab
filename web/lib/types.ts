export type Role = "user" | "admin";

export type User = {
  id: string;
  username: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  lastLoginAt?: string;
};

export type Activity = {
  id: string;
  userId: string;
  type: string;
  detail: string;
  createdAt: string;
};

export type SelectionRef = {
  key: string;
  bookCode: string;
  bookName: string;
  chapter: number;
  verse: number;
  start: number;
  length: number;
  surface: string;
};

export type SelectionHistory = {
  id: string;
  userId: string;
  title: string;
  bookCode: string;
  bookName: string;
  chapter: number;
  selections: SelectionRef[];
  createdAt: string;
};

export type QuizOptions = { firstLetter: boolean; stars: boolean };
export type Quiz = {
  id: string;
  userId: string;
  title: string;
  sourceHistoryId?: string;
  bookCode: string;
  bookName: string;
  chapter: number;
  selections: SelectionRef[];
  options: QuizOptions;
  createdAt: string;
};

export type Attempt = {
  id: string;
  userId: string;
  quizId: string;
  answers: Record<string, string>;
  correct: number;
  total: number;
  createdAt: string;
};

export type WrongNote = SelectionRef & {
  id: string;
  userId: string;
  wrongCount: number;
  correctCount: number;
  lastWrongAnswer: string;
  firstWrongAt: string;
  lastWrongAt: string;
  lastCorrectAt?: string;
};

export type Draft = {
  userId: string;
  bookCode: string;
  chapter: number;
  selections: SelectionRef[];
  updatedAt: string;
};

export type Database = {
  users: User[];
  activities: Activity[];
  drafts: Draft[];
  selectionHistories: SelectionHistory[];
  quizzes: Quiz[];
  attempts: Attempt[];
  wrongNotes: WrongNote[];
};
