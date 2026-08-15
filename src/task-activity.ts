interface TaskActivityBase {
  id: string;
  actorName: string;
  createdAt: number;
}

export interface TaskCommentActivity extends TaskActivityBase {
  type: 'comment';
  text: string;
}

export interface TaskPhotoActivity extends TaskActivityBase {
  type: 'photo';
  attachmentId: string;
  fileName: string;
  url?: string;
}

export interface TaskChangeActivity extends TaskActivityBase {
  type: 'change';
  summary: string;
  changeKind: string;
}

export type TaskActivityEntry = TaskCommentActivity | TaskPhotoActivity | TaskChangeActivity;

export type TaskActivityFilter = 'all' | 'comment' | 'photo' | 'change';
