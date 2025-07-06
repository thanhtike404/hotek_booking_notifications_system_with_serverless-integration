import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { APIGatewayProxyEvent } from "aws-lambda";
import { deleteConnectionById } from "./dynamoClient";

export const sendToConnection = async (
  event: APIGatewayProxyEvent,
  connectionId: string,
  message: string,
  userId: string,
  action: string
): Promise<void> => {
  const domainName = event.requestContext?.domainName;
  const stage = event.requestContext?.stage;

  if (!domainName || !stage) {
    console.error("❌ Missing domainName or stage");
    return;
  }

  const payload = {
    action,
    message,
    userId,
    createdAt: new Date().toISOString(),
  };

  const postToConnectionCommand = new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: JSON.stringify(payload),
  });

  const apiGatewayManagementApi = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });

  try {
    await apiGatewayManagementApi.send(postToConnectionCommand);
    console.log(`✅ Sent message to connection ${connectionId}`);
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 410) {
      console.warn(`⚠️ Stale connection. Removing connectionId: ${connectionId}`);
      await deleteConnectionById(connectionId);
    } else {
      console.error(`❌ Error sending to connection ${connectionId}:`, err);
      throw err;
    }
  }
};
