import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

// ─── Reply sub-schema (nested inside comments) ──────────────────────────────────
const replySchema = new MongooseSchema(
  {
    author: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    upvotes: {
      type: [MongooseSchema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    downvotes: {
      type: [MongooseSchema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    verified: {
      type: Boolean,
      default: false,
    },
    isExpertAnswer: {
      type: Boolean,
      default: false,
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: true, timestamps: true }
);

// ─── Comment sub-schema ─────────────────────────────────────────────────────────
const commentSchema = new MongooseSchema(
  {
    author: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    upvotes: {
      type: [MongooseSchema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    downvotes: {
      type: [MongooseSchema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    verified: {
      type: Boolean,
      default: false,
    },
    isExpertAnswer: {
      type: Boolean,
      default: false,
    },
    parentId: {
      type: MongooseSchema.Types.ObjectId,
      default: null,
    },
    depth: {
      type: Number,
      default: 0,
    },
    replies: {
      type: [replySchema],
      default: [],
    },
  },
  { timestamps: true }
);

// ─── Enums ─────────────────────────────────────────────────────────────────────
export type CommunityPostStatus = 'answered' | 'unanswered';
export type EscalationStatus = 'none' | 'escalated' | 'resolved' | 'dismissed';

// Interface for embedded comment subdocuments (used by buildCommentTree)
export interface IComment {
  _id: Types.ObjectId;
  author: Types.ObjectId;
  body: string;
  upvotes: Types.ObjectId[];
  downvotes: Types.ObjectId[];
  verified: boolean;
  isExpertAnswer: boolean;
  parentId: Types.ObjectId | null;
  depth: number;
  replies: IComment[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Document interface ─────────────────────────────────────────────────────────
export interface ICommunityPost extends Document {
  title: string;
  body: string;
  author: Types.ObjectId;
  status: CommunityPostStatus;
  answer: string | null;
  answerIsExpert?: boolean;
  upvotes: Types.ObjectId[];
  comments: Types.Subdocument[];
  reports: Array<{ reportedBy: Types.ObjectId; reason: string; createdAt?: Date }>;
  embedding?: number[];
  // Escalation fields
  escalationStatus: EscalationStatus;
  escalatedAt: Date | null;
  escalationReason: string | null;
  escalatedBy: Types.ObjectId | null;
  escalationResolvedAt: Date | null;
  escalationResolvedBy: Types.ObjectId | null;
  escalationOutcome: string | null;
}

// ─── Schema ─────────────────────────────────────────────────────────────────────
const communityPostSchema = new MongooseSchema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    body: {
      type: String,
      required: [true, 'Post body is required'],
      trim: true,
    },
    author: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['answered', 'unanswered'] as CommunityPostStatus[],
      default: 'unanswered',
    },
    answer: {
      type: String,
      default: null,
    },
    answerIsExpert: {
      type: Boolean,
      default: false,
    },
    upvotes: {
      type: [MongooseSchema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    comments: {
      type: [commentSchema],
      default: [],
    },
    reports: {
      type: [{
        reportedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
        reason: { type: String, trim: true },
        createdAt: { type: Date, default: Date.now },
      }],
      default: [],
    },
    embedding: {
      type: [Number],
      default: undefined,
    },
    // ── Escalation tracking ─────────────────────────────────────────────────────
    escalationStatus: {
      type: String,
      enum: ['none', 'escalated', 'resolved', 'dismissed'] as EscalationStatus[],
      default: 'none',
    },
    escalatedAt: {
      type: Date,
      default: null,
    },
    escalationReason: {
      type: String,
      default: null,
    },
    escalatedBy: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Resolved/dismissed: which admin acted and when
    escalationResolvedAt: {
      type: Date,
      default: null,
    },
    escalationResolvedBy: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Resolution outcome note (e.g. "answered in thread", "converted to FAQ #123")
    escalationOutcome: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Text index for keyword search
communityPostSchema.index({ title: 'text', body: 'text' });

export default mongoose.model<ICommunityPost>(
  'CommunityPost',
  communityPostSchema,
  'yaksha_faq_communityposts'
);