import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as budgets from "aws-cdk-lib/aws-budgets";

export class CostOptimizationPhase2Stack extends cdk.Stack {
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

    // 1. Networking: no NAT Gateways.
    const vpc = new ec2.Vpc(this, "ServerlessVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "IsolatedDatabase",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // 2. Private access to S3 without a NAT Gateway.
    vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // Private connectivity to Secrets Manager from isolated subnets.
    // Interface endpoints incur additional charges.
    vpc.addInterfaceEndpoint("SecretsManagerEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
    });

    // 3. S3: lifecycle policies and security.
    const aggressiveBucket = new s3.Bucket(this, "AggressiveDataBucket", {
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: "AggressiveColdDataPolicy",
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
    });

    // 4. Aurora PostgreSQL Serverless v2.
    const dbSecurityGroup = new ec2.SecurityGroup(this, "DBSecurityGroup", {
      vpc,
      description: "Database access controlled by security group rules",
      allowAllOutbound: false,
    });

    const dbCluster = new rds.DatabaseCluster(
      this,
      "AuroraServerlessV2Cluster",
      {
        engine: rds.DatabaseClusterEngine.auroraPostgres({
          version: rds.AuroraPostgresEngineVersion.VER_15_10,
        }),
        writer: rds.ClusterInstance.serverlessV2("WriterInstance", {
          publiclyAccessible: false,
        }),
        serverlessV2MinCapacity: 0.5,
        serverlessV2MaxCapacity: 2.0,
        vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        securityGroups: [dbSecurityGroup],
        removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      },
    );

    // 5. Lambda: event-driven application compute.
    const apiFunction = new lambda.Function(this, "OptimizedApiHandler", {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "index.handler",
      code: lambda.Code.fromInline(`
          exports.handler = async (event) => {
            return {
              statusCode: 200,
              headers: {
                "content-type": "application/json"
              },
              body: JSON.stringify({
                message: "Processed via Serverless Architecture"
              })
            };
          };
        `),
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      environment: {
        DB_SECRET_ARN: dbCluster.secret?.secretArn ?? "",
        BUCKET_NAME: aggressiveBucket.bucketName,
      },
    });

    // Permit database connections only from this Lambda function.
    dbCluster.connections.allowDefaultPortFrom(apiFunction);

    // Grant access to the S3 bucket.
    aggressiveBucket.grantReadWrite(apiFunction);

    // Grant permission to retrieve database credentials.
    if (dbCluster.secret) {
      dbCluster.secret.grantRead(apiFunction);
    }

    // 6. Cost governance: $1,500 monthly budget.
    new budgets.CfnBudget(this, "BossFightBudget", {
      budget: {
        budgetName: "Phase2-Budget-1500USD",
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: {
          amount: 1500,
          unit: "USD",
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 50,
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
            threshold: 80,
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
    new cdk.CfnOutput(this, "AggressiveBucketName", {
      value: aggressiveBucket.bucketName,
    });

    new cdk.CfnOutput(this, "AuroraClusterEndpoint", {
      value: dbCluster.clusterEndpoint.hostname,
    });

    new cdk.CfnOutput(this, "LambdaFunctionName", {
      value: apiFunction.functionName,
    });
  }
}
