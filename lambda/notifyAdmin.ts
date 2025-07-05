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
  import {getConnectionsByUserId} from './utils/dynamoClient'
  import { sendToConnection } from "./utils/webSocket";
  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  
  export const handler = async (
    event: APIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    console.log("=== NOTIFY ADMIN HANDLER STARTED ===");
    console.log("Full event:", JSON.stringify(event, null, 2));
  
    try {
      if (!event.body) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Missing request body" }),
        };
      }
  
      const { userId, message } = JSON.parse(event.body || "{}");
  
      if (!userId || !message) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "userId and message are required" }),
        };
      }
  
   
  
      // Query connections from DynamoDB
      const queryResponse =await getConnectionsByUserId(userId)
  
      const items: any[] = queryResponse;
  
      if (!items || items.length === 0) {
        console.warn("No connections found for userId:", userId);
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Connection not found" }),
        };
      }
  
    
      
      const sendPromises = items.map((item) =>
        sendToConnection(event, item.connectionId, message, userId, "notifyAdmin")
        // apiGatewayManagement
      );
  
      await Promise.all(sendPromises);
  
      console.log("✅ Messages sent successfully to all matching connections");
  
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Admin notified" }),
      };
    } catch (error) {
      console.error("❌ Error in notifyAdmin handler:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Internal server error" }),
      };
    }
  };
  