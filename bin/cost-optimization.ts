#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { CostOptimizationPhase1Stack } from "../lib/cost-optimization-phase1-stack";

const app = new cdk.App();

// AWS environment configuration.
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};

// Phase 1: Infrastructure rightsizing.
new CostOptimizationPhase1Stack(app, "CostOptimizationPhase1Stack", {
  env,
  description:
    "Cost Optimization Phase 1 - Infrastructure Rightsizing and S3 Lifecycle Management",
});
