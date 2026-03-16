import { z } from "zod/v4";

// Chat
export const ChatSchema = z.object({
  qaSetId: z.string().min(1),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(50000),
  })).min(1),
  systemPrompt: z.string().max(10000).optional(),
});

// Investment (투자/반대 투자)
export const InvestSchema = z.object({
  amount: z.number().int().positive().max(1000),
  isNegative: z.boolean().optional().default(false),
  comment: z.string().max(100).optional(),
  huntingReason: z.enum(["hallucination", "outdated_info", "incorrect_fact", "missing_nuance", "source_mismatch", "logical_fallacy", "overgeneralization"]).optional(),
  huntingEvidence: z.string().min(20).max(500).optional(),
  huntingTargetMessageId: z.string().optional(),
});

// Share
export const ShareSchema = z.object({
  comment: z.string().max(200).optional(),
});

// Onboarding
export const OnboardingSubmitSchema = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(5000),
  interests: z.array(z.string()).optional(),
});

// Improve message
export const ImproveMessageSchema = z.object({
  content: z.string().min(1).max(50000),
  note: z.string().max(500).optional(),
});

// Create QASet
export const CreateQASetSchema = z.object({
  title: z.string().max(200).optional(),
});

// Create QASet with question
export const CreateQASetWithQuestionSchema = z.object({
  question: z.string().min(1).max(2000),
});

// Human answer
export const HumanAnswerSchema = z.object({
  content: z.string().min(1).max(50000),
});

// Notifications mark read
export const MarkNotificationsReadSchema = z.object({
  ids: z.array(z.string()).optional(),
});

// Relations
export const CreateRelationSchema = z.object({
  qaSetId: z.string().optional(),
  sourceQASetId: z.string().optional(),
  targetQASetId: z.string().optional(),
  sourceOpinionId: z.string().optional(),
  targetOpinionId: z.string().optional(),
  relationType: z.string().min(1),
  customLabel: z.string().max(100).optional(),
});

// Opinion
export const CreateOpinionSchema = z.object({
  content: z.string().min(1).max(5000),
  relatedQASetId: z.string().optional(),
  relationType: z.string().optional(),
});

// Fork
export const ForkSchema = z.object({
  comment: z.string().max(200).optional(),
});

// Uninvest
export const UninvestSchema = z.object({
  reason: z.string().max(500).optional(),
});

// Update QASet
export const UpdateQASetSchema = z.object({
  title: z.string().max(200).optional(),
  summary: z.string().max(1000).optional(),
});

// Update relation
export const UpdateRelationSchema = z.object({
  relationType: z.string().min(1),
  customLabel: z.string().max(100).optional(),
});
