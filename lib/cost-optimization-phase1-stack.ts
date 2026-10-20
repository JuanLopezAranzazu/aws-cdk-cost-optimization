import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as rds from "aws-cdk-lib/aws-rds";
import * as budgets from "aws-cdk-lib/aws-budgets";

export class CostOptimizationPhase1Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Require an actual email address for budget notifications.
    const emailSubscriber = this.node.tryGetContext("email");

    if (
      typeof emailSubscriber !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailSubscriber)
    ) {
      throw new Error(
        "Provide a valid email address using -c email=you@example.com",
      );
    }

    // 1. Networking
    const vpc = new ec2.Vpc(this, "OptimizedVpc", {
      maxAzs: 3,
      natGateways: 1,
    });

    // 2. Compute: keep five application instances.
    // ARM64 and burstable performance must be validated for the workload.
    const appSecurityGroup = new ec2.SecurityGroup(this, "AppInstanceSG", {
      vpc,
      description: "Security group for private application instances",
      allowAllOutbound: true,
    });

    const appInstances = new autoscaling.AutoScalingGroup(
      this,
      "OptimizedAppInstances",
      {
        vpc,
        minCapacity: 5,
        desiredCapacity: 5,
        maxCapacity: 5,
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T4G,
          ec2.InstanceSize.LARGE,
        ),
        machineImage: ec2.MachineImage.latestAmazonLinux2023({
          cpuType: ec2.AmazonLinuxCpuType.ARM_64,
        }),
        securityGroup: appSecurityGroup,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      },
    );

    // 3. S3: lifecycle policies and public-access protection.
    const optimizedBucket = new s3.Bucket(this, "OptimizedDataBucket", {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: "ColdDataTransitionPolicy",
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(180),
            },
          ],
          noncurrentVersionTransitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
    });

    // 4. Database: retain Multi-AZ for availability.
    const database = new rds.DatabaseInstance(this, "OptimizedRDSInstance", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.M6G,
        ec2.InstanceSize.XLARGE,
      ),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      multiAz: true,
      allocatedStorage: 100,
      maxAllocatedStorage: 500,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });

    // Only application instances can connect to the database port.
    database.connections.allowDefaultPortFrom(appInstances);

    // 5. Cost governance: $3,000 monthly budget.
    new budgets.CfnBudget(this, "MonthlyCostBudget", {
      budget: {
        budgetName: "Phase1-Budget-3000USD",
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: {
          amount: 3000,
          unit: "USD",
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 80,
          },
          subscribers: [
            {
              subscriptionType: "EMAIL",
              address: emailSubscriber,
            },
          ],
        },
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 100,
          },
          subscribers: [
            {
              subscriptionType: "EMAIL",
              address: emailSubscriber,
            },
          ],
        },
      ],
    });

    // Useful identifiers in the CloudFormation outputs.
    new cdk.CfnOutput(this, "OptimizedBucketName", {
      value: optimizedBucket.bucketName,
    });

    new cdk.CfnOutput(this, "DatabaseEndpoint", {
      value: database.dbInstanceEndpointAddress,
    });

    new cdk.CfnOutput(this, "ApplicationAutoScalingGroupName", {
      value: appInstances.autoScalingGroupName,
    });
  }
}
