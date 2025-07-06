import {
    APIGatewayProxyEvent,
    APIGatewayProxyResult,
  } from "aws-lambda";
  import {
    ApiGatewayManagementApiClient,
    PostToConnectionCommand,
  } from "@aws-sdk/client-apigatewaymanagementapi";
  import {
    DynamoDBDocumentClient,
    QueryCommand,
  } from "@aws-sdk/lib-dynamodb";
  import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
  import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
  // Initialize the DynamoDB Document Client
  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  
  /**
   * Retrieves connections from DynamoDB for a given userId.
   * This function is now reusable for any part of your application
   * that needs to query connections by userId.
   *
   * @param userId The ID of the user whose connections are to be retrieved.
   * @returns A Promise that resolves to an array of connection items, or an empty array if none are found.
   */
  export async function getConnectionsByUserId(userId: string): Promise<any[]> {
    try {
      const queryResponse = await docClient.send(
        new QueryCommand({
          TableName: process.env.TABLE_NAME!, // Ensure TABLE_NAME is set in your Lambda environment variables
          IndexName: "userId-index", // Ensure this index exists on your DynamoDB table
          KeyConditionExpression: "userId = :userId",
          ExpressionAttributeValues: {
            ":userId": userId,
          },
        })
      );
      return queryResponse.Items || [];
    } catch (error) {
      console.error(`❌ Error querying connections for userId ${userId}:`, error);
      // Re-throw or handle the error as appropriate for your application's error handling strategy
      throw error;
    }
  }
  
  export async function deleteConnectionById(connectionId: string): Promise<void> {
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: process.env.TABLE_NAME!,
        Key: { connectionId },
      })
    );
    console.log(`🧹 Stale connection detected. Deleted connectionId: ${connectionId}`);
  } catch (error) {
    console.error(`❌ Failed to delete connectionId ${connectionId}:`, error);
  }
}
