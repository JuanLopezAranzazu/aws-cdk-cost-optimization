#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { CostOptimizationPhase1Stack } from "../lib/cost-optimization-phase1-stack";
import { CostOptimizationPhase2Stack } from "../lib/cost-optimization-phase2-stack";

const app = new cdk.App();

// AWS environment configuration.
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};

// Optional context parameter: -c phase=1, -c phase=2, or -c phase=all.
const phase = app.node.tryGetContext("phase") || "all";

if (!["1", "2", "all"].includes(phase)) {
  throw new Error(
    'Invalid phase. Use "-c phase=1", "-c phase=2", or "-c phase=all".',
  );
}

// Phase 1: Infrastructure rightsizing.
if (phase === "1" || phase === "all") {
  new CostOptimizationPhase1Stack(app, "CostOptimizationPhase1Stack", {
    env,
    description:
      "Cost Optimization Phase 1 - Infrastructure Rightsizing and S3 Lifecycle Management",
  });
}

// Phase 2: Serverless architecture.
if (phase === "2" || phase === "all") {
  new CostOptimizationPhase2Stack(app, "CostOptimizationPhase2Stack", {
    env,
    description:
      "Cost Optimization Phase 2 - Serverless Compute and Aurora Serverless v2",
  });
}
