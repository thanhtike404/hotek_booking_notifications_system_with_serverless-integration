import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { Client } from 'pg';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event: any): Promise<any> => {
  const { userId, message } = JSON.parse(event.body);

  const command = new QueryCommand({
    TableName: process.env.TABLE_NAME,
    IndexName: "userId-index",
    KeyConditionExpression: "userId = :userId",
    ExpressionAttributeValues: {
      ":userId": userId,
    },
  });

  try {
    const { Items } = await docClient.send(command);

    if (Items && Items.length > 0) {
      const connectionId = Items[0].connectionId;
      const apiGatewayManagementApi = new ApiGatewayManagementApiClient({
        endpoint: `https://${event.requestContext.domainName}/${event.requestContext.stage}`,
      });

      const postToConnectionCommand = new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify({ message }),
      });

      await apiGatewayManagementApi.send(postToConnectionCommand);
    } else {
      const pgClient = new Client({
        connectionString: process.env.DATABASE_URL,
      });
      await pgClient.connect();
      await pgClient.query(
        'INSERT INTO "Notification" ("userId", message, "isRead", "createdAt") VALUES ($1, $2, $3, $4)',
        [userId, message, false, new Date()]
      );
      await pgClient.end();
    }

    return {
      statusCode: 200,
    };
  } catch (err) {
    console.log(err);
    return {
      statusCode: 500,
    };
  }
};