# AWS Cost Optimization

A two-phase AWS infrastructure cost optimization project built with **AWS CDK and TypeScript**. It demonstrates how infrastructure rightsizing, Amazon S3 lifecycle policies, serverless compute, and dynamic database scaling can help reduce cloud costs.

## Overview

Cloud infrastructure can become expensive when resources are overprovisioned or remain active without sufficient workloads. This project explores two approaches to optimizing a sample AWS environment.

- **Phase 1 — Infrastructure Rightsizing:** Optimizes compute and database resources while applying lifecycle policies to Amazon S3.
- **Phase 2 — Serverless Architecture:** Uses AWS Lambda, Amazon Aurora Serverless v2, and more aggressive S3 lifecycle policies to explore a serverless approach.

The project also configures AWS Budgets to monitor spending and send email notifications when configured thresholds are exceeded.

> **Note:** The budget limits are project targets, not guaranteed spending caps. Actual savings depend on workload characteristics, AWS pricing, resource utilization, and data access patterns.

## Architecture

### Phase 1: Infrastructure Rightsizing

Resources provisioned:

- **Amazon VPC:** Network isolation across multiple Availability Zones, with one NAT Gateway.
- **Amazon EC2 Auto Scaling:** Five `t4g.large` instances running Amazon Linux 2023 ARM64, configured with a fixed capacity of five instances.
- **Amazon RDS for PostgreSQL:** `db.m6g.xlarge`, Multi-AZ deployment, GP3 storage, encryption, and deletion protection.
- **Amazon S3:** Versioning, server-side encryption, public access blocking, and lifecycle transitions.
- **AWS Budgets:** Monthly budget of $3,000, with actual-cost alerts at 80% and 100%.

#### S3 lifecycle policies

| Rule | Configuration |
|---|---|
| Transition to Standard-IA | After 90 days |
| Transition to Glacier Flexible Retrieval | After 180 days |
| Noncurrent versions | Transition to Glacier after 90 days |

**Optimization rationale:** Right-size compute and database capacity for the workload and move older data into lower-cost storage classes.

### Phase 2: Serverless Architecture

Resources provisioned:

- **Amazon VPC:** Public and isolated private subnets, with no NAT Gateway.
- **Amazon S3 Gateway Endpoint:** Provides private connectivity to S3 from the VPC.
- **Secrets Manager Interface Endpoint:** Supports private access to AWS Secrets Manager.
- **Amazon Aurora PostgreSQL Serverless v2:** Configured with a minimum capacity of 0.5 ACUs and a maximum of 2 ACUs.
- **AWS Lambda:** ARM64 function configured with 512 MB of memory and a 10-second timeout.
- **Amazon S3:** Lifecycle transitions to lower-cost storage classes.
- **AWS Budgets:** Monthly budget of $1,500, with actual-cost alerts at 50% and 80%.

#### Phase 2 S3 lifecycle policies

| Rule | Configuration |
|---|---|
| Transition to Standard-IA | After 30 days |
| Transition to S3 Glacier Deep Archive | After 90 days |

**Optimization rationale:** Explore serverless compute and database capacity scaling, reduce idle infrastructure, and move infrequently accessed data to archival storage.

> **Current implementation:** The Lambda handler is a demonstration endpoint at the function-handler level. It returns a JSON message but does not yet query Aurora or access S3 in its business logic. An API Gateway or Lambda Function URL has not been configured.

## Technology Stack

- **Infrastructure as Code:** AWS CDK
- **Language:** TypeScript
- **Compute:** Amazon EC2, AWS Lambda
- **Database:** Amazon RDS for PostgreSQL, Amazon Aurora PostgreSQL Serverless v2
- **Storage:** Amazon S3
- **Networking:** Amazon VPC, NAT Gateway, VPC endpoints
- **Cost Monitoring:** AWS Budgets
- **Deployment:** AWS CloudFormation

## Project Structure

```text
cost-optimization/
├── bin/
│   └── cost-optimization.ts
├── lib/
│   ├── cost-optimization-phase1-stack.ts
│   └── cost-optimization-phase2-stack.ts
├── test/
├── cdk.json
├── package.json
├── tsconfig.json
└── README.md
```

## Prerequisites

Before deploying, make sure you have:

- An AWS account.
- AWS CLI installed and configured.
- Node.js and npm installed.
- AWS CDK dependencies installed.
- Appropriate IAM permissions to create the required resources.
- A valid email address for budget notifications.

Configure your AWS credentials and select the deployment region:

```bash
aws configure
aws sts get-caller-identity
aws configure set region us-east-1
```

Install the project dependencies:

```bash
npm install
```

If AWS CDK is not installed globally, you can use the local CLI through `npx`.

## Deployment

The application entry point supports selecting an individual phase through the CDK context variable `phase`.

Set your email address in the commands below.

### 1. Synthesize Phase 1

```bash
npx cdk synth -c phase=1 -c email=you@example.com
```

Review the proposed infrastructure changes:

```bash
npx cdk diff CostOptimizationPhase1Stack \
  -c phase=1 \
  -c email=you@example.com
```

Deploy Phase 1:

```bash
npx cdk deploy CostOptimizationPhase1Stack \
  -c phase=1 \
  -c email=you@example.com
```

### 2. Synthesize Phase 2

```bash
npx cdk synth -c phase=2 -c email=you@example.com
```

Review the proposed infrastructure changes:

```bash
npx cdk diff CostOptimizationPhase2Stack \
  -c phase=2 \
  -c email=you@example.com
```

Deploy Phase 2:

```bash
npx cdk deploy CostOptimizationPhase2Stack \
  -c phase=2 \
  -c email=you@example.com
```

The commands above assume that the project entry point includes the `phase` selector and that the installed AWS CDK version supports the constructs used in the stacks.

### 3. Deploy both phases

To synthesize or deploy both stacks, use the default `phase=all` behavior.

```bash
npx cdk synth -c phase=all -c email=you@example.com
```

```bash
npx cdk deploy --all -c phase=all -c email=you@example.com
```

Deploying both phases simultaneously creates separate infrastructure environments and can significantly increase costs. Deploy only the phase you intend to test.

## Validation

After deployment, verify the CloudFormation stack status:

```bash
aws cloudformation describe-stacks \
  --stack-name CostOptimizationPhase1Stack \
  --region us-east-1 \
  --query "Stacks[0].StackStatus" \
  --output text
```

For Phase 2, replace the stack name with `CostOptimizationPhase2Stack`.

Expected status after successful creation:

```text
CREATE_COMPLETE
```

Additional validation steps:

1. Check EC2 Auto Scaling and confirm the desired instance capacity.
2. Verify that the RDS database or Aurora cluster is available.
3. Inspect S3 bucket encryption, versioning, and lifecycle configuration.
4. Invoke the Phase 2 Lambda function and inspect its JSON response.
5. Confirm that AWS Budgets contains the configured thresholds and notification email.

These checks validate resource creation and configuration. They do not, by themselves, demonstrate a specific percentage of cost savings.

## Cost Considerations

This project provisions resources that may incur charges even when they are not actively used.

- **EC2:** Five continuously running `t4g.large` instances can incur ongoing compute costs.
- **RDS Multi-AZ:** Database compute, storage, and standby infrastructure contribute to costs.
- **NAT Gateway:** Hourly charges and data processing charges apply.
- **Aurora Serverless v2:** Database capacity and storage can incur costs even under light workloads.
- **Secrets Manager VPC endpoint:** Interface endpoints incur hourly and data processing charges.
- **S3 lifecycle policies:** Minimum storage durations, transition charges, retrieval costs, and early deletion charges can apply depending on the storage class.

Use the AWS Pricing Calculator and AWS Cost Explorer to estimate and monitor actual expenses. AWS Budgets provides notifications; it does not automatically shut down resources when a threshold is reached.

## Cleanup

To remove Phase 1:

```bash
npx cdk destroy CostOptimizationPhase1Stack \
  -c phase=1 \
  -c email=you@example.com
```

To remove Phase 2:

```bash
npx cdk destroy CostOptimizationPhase2Stack \
  -c phase=2 \
  -c email=you@example.com
```

Before destroying a stack, review its removal policies and backup requirements.

**Important cleanup notes:**

- The Phase 1 RDS instance has deletion protection enabled. Disable deletion protection before attempting to destroy the stack.
- The Phase 1 database is configured to retain a final snapshot. The snapshot may continue to incur storage charges.
- The S3 buckets use `RemovalPolicy.RETAIN`. They may remain after their CloudFormation stacks are deleted and can continue to incur storage charges.
- Verify the status of CloudFormation, EC2, RDS, VPC, S3, and retained snapshots after cleanup.

## Learning Objectives

This project demonstrates practical AWS infrastructure concepts:

- Infrastructure as Code with AWS CDK and TypeScript.
- EC2 instance sizing and Auto Scaling configuration.
- RDS Multi-AZ deployments and database protection.
- S3 lifecycle management and archival storage.
- Serverless database capacity scaling with Aurora Serverless v2.
- Private networking and VPC endpoints.
- AWS Budgets and cost monitoring.
- Infrastructure deployment, validation, and cleanup with CloudFormation.
