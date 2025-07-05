import { Stack, StackProps, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  WebSocketApi,
  WebSocketStage,
} from "aws-cdk-lib/aws-apigatewayv2";
import { WebSocketLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import {
  Function,
  Runtime,
  Code,
  LayerVersion,
} from "aws-cdk-lib/aws-lambda";
import { Table, AttributeType, BillingMode } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

export class WebSocketNotificationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // DynamoDB table to store connection IDs
    const connectionsTable = new Table(this, "ConnectionsTable", {
      partitionKey: { name: "connectionId", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    connectionsTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
    });

    // Lambda function for connect
    const connectHandler = new Function(this, "ConnectHandler", {
      runtime: Runtime.NODEJS_18_X,
      handler: "connect.handler",
      code: Code.fromAsset("./dist/lambda"),
      environment: {
        TABLE_NAME: connectionsTable.tableName,
      },
    });

    // Lambda function for disconnect
    const disconnectHandler = new Function(this, "DisconnectHandler", {
      runtime: Runtime.NODEJS_18_X,
      handler: "disconnect.handler",
      code: Code.fromAsset("./dist/lambda"),
      environment: {
        TABLE_NAME: connectionsTable.tableName,
      },
    });

    const defaultHandler = new Function(this, "DefaultHandler", {
      runtime: Runtime.NODEJS_18_X,
      handler: "default.handler",
      code: Code.fromAsset("./dist/lambda"),
      environment: {
        TABLE_NAME: connectionsTable.tableName,
      },
    });

    // Lambda function for sending messages
    const messageHandler = new Function(this, "MessageHandler", {
      runtime: Runtime.NODEJS_18_X,
      handler: "sendMessage.handler",
      code: Code.fromAsset("./dist/lambda"),
      environment: {
        TABLE_NAME: connectionsTable.tableName,
      },
    });

    // Lambda function for sending notifications
    const sendNotificationHandler = new NodejsFunction(this, "SendNotificationHandler", {
      runtime: Runtime.NODEJS_18_X,
      entry: "lambda/sendNotification.ts",
      depsLockFilePath: "package-lock.json",
      environment: {
        TABLE_NAME: connectionsTable.tableName,
        DATABASE_URL: process.env.DATABASE_URL!,
      },
    });
    const notifyAdminHandler = new NodejsFunction(this, "NotifyAdminHandler", {
      runtime: Runtime.NODEJS_18_X,
      entry: "lambda/notifyAdmin.ts",
      depsLockFilePath: "package-lock.json",
      environment: {
        TABLE_NAME: connectionsTable.tableName,
        DATABASE_URL: process.env.DATABASE_URL!,
      },
    });

    // Grant permissions to lambdas
    connectionsTable.grantReadWriteData(connectHandler);
    connectionsTable.grantReadWriteData(disconnectHandler);
    connectionsTable.grantReadWriteData(messageHandler);
    connectionsTable.grantReadWriteData(defaultHandler);
    connectionsTable.grantReadWriteData(sendNotificationHandler);
    connectionsTable.grantReadWriteData(notifyAdminHandler);

    // Allow Lambda to call API Gateway management API
    const apiPermission = new PolicyStatement({
      actions: ["execute-api:ManageConnections"],
      resources: ["*"],
    });

    messageHandler.addToRolePolicy(apiPermission);
    sendNotificationHandler.addToRolePolicy(apiPermission);
    notifyAdminHandler.addToRolePolicy(apiPermission);

    // WebSocket API
    const wsApi = new WebSocketApi(this, "WebSocketAPI", {
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration("ConnectIntegration", connectHandler),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration("DisconnectIntegration", disconnectHandler),
      },
    });

    // Custom route: sendMessage
    wsApi.addRoute("sendMessage", {
      integration: new WebSocketLambdaIntegration("MessageIntegration", messageHandler),
    });

    // Custom route: sendNotification
    wsApi.addRoute("sendNotification", {
      integration: new WebSocketLambdaIntegration(
        "SendNotificationIntegration",
        sendNotificationHandler
      ),
    });
    wsApi.addRoute("notifyAdmin", {
      integration: new WebSocketLambdaIntegration(
        "NotifyAdminIntegration",
        notifyAdminHandler
      ),
    });

    wsApi.addRoute("$default", {
  integration: new WebSocketLambdaIntegration("DefaultIntegration", defaultHandler),
});
sendNotificationHandler.addEnvironment('WEBSOCKET_ENDPOINT', wsApi.apiEndpoint);

    // WebSocket Stage
    new WebSocketStage(this, "DevStage", {
      webSocketApi: wsApi,
      stageName: "dev",
      autoDeploy: true,
    });
  }
}
