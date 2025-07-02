import {
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  ScanCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

interface ConnectionItem {
  connectionId: string;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);

  const ddbcommand = new ScanCommand({
    TableName: process.env.TABLE_NAME,
  });

  let connections: ScanCommandOutput;
  try {
    connections = await docClient.send(ddbcommand);
  } catch (err) {
    console.error("Error scanning table:", err);
    return {
      statusCode: 500,
      body: "Failed to retrieve connections",
    };
  }

  const callbackAPI = new ApiGatewayManagementApiClient({
    apiVersion: "2018-11-29",
    endpoint: `https://${event.requestContext.domainName}/${event.requestContext.stage}`,
  });

  let message: string;
  try {
    const parsedBody = JSON.parse(event.body || "{}");
    message = parsedBody.message;
  } catch (err) {
    return {
      statusCode: 400,
      body: "Invalid request body",
    };
  }

  const sendMessages = (connections.Items || []).map(async (item) => {
    const { connectionId } = item as ConnectionItem;
    if (connectionId !== event.requestContext.connectionId) {
      try {
        await callbackAPI.send(
          new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: Buffer.from(message),
          })
        );
      } catch (err) {
        console.error("Error sending message:", err);
      }
    }
  });

  try {
    await Promise.all(sendMessages);
  } catch (err) {
    console.error("Error sending one or more messages:", err);
    return {
      statusCode: 500,
      body: "Failed to send messages",
    };
  }

  return {
    statusCode: 200,
    body: "Message sent",
  };
};
