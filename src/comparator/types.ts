import { z } from 'zod';
import {
  TrajectoryStepSummarySchema,
  StepAlignmentTypeSchema,
  AlignedStepSchema,
  DivergenceTypeSchema,
  DivergencePointSchema,
  RegressionSeveritySchema,
  TrajectoryAnomalyTypeSchema,
  TrajectoryAnomalySchema,
  TrajectoryDiffSummarySchema,
  TrajectoryRegressionAnalysisSchema,
  TrajectoryDiffSchema,
  TrajectoryCompareOptionsSchema,
  AssertionDiffStatusSchema,
  AssertionDiffItemSchema,
  ReportDiffSchema,
} from './schemas.js';

export type TrajectoryStepSummary = z.infer<typeof TrajectoryStepSummarySchema>;
export type StepAlignmentType = z.infer<typeof StepAlignmentTypeSchema>;
export type AlignedStep = z.infer<typeof AlignedStepSchema>;
export type DivergenceType = z.infer<typeof DivergenceTypeSchema>;
export type DivergencePoint = z.infer<typeof DivergencePointSchema>;
export type RegressionSeverity = z.infer<typeof RegressionSeveritySchema>;
export type TrajectoryAnomalyType = z.infer<typeof TrajectoryAnomalyTypeSchema>;
export type TrajectoryAnomaly = z.infer<typeof TrajectoryAnomalySchema>;
export type TrajectoryDiffSummary = z.infer<typeof TrajectoryDiffSummarySchema>;
export type TrajectoryRegressionAnalysis = z.infer<typeof TrajectoryRegressionAnalysisSchema>;
export type TrajectoryDiff = z.infer<typeof TrajectoryDiffSchema>;
export type TrajectoryCompareOptions = z.infer<typeof TrajectoryCompareOptionsSchema>;
export type AssertionDiffStatus = z.infer<typeof AssertionDiffStatusSchema>;
export type AssertionDiffItem = z.infer<typeof AssertionDiffItemSchema>;
export type ReportDiff = z.infer<typeof ReportDiffSchema>;
