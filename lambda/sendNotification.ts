import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Client as PgClient } from "pg";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
import {getConnectionsByUserId} from './utils/dynamoClient'
import { sendToConnection } from "./utils/webSocket";



export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("=== SENDNOTIFICATION HANDLER STARTED ===");
  console.log("Full event:", JSON.stringify(event, null, 2));

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing request body" }),
      };
    }

    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;

    console.log("Parsed body:", JSON.stringify(body, null, 2));

    const { userId, message } = body;

    if (!userId || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "userId and message are required" }),
      };
    }

    console.log(`🔍 Looking for connections for userId: ${userId}`);

    const queryResponse =await getConnectionsByUserId(userId)
  
    const items: any[] = queryResponse;

    

    console.log("📊 DynamoDB query result:", JSON.stringify(items, null, 2));
    console.log(`📊 Number of connections found: ${items?.length || 0}`);

    if (items && items.length > 0) {
      const connectionId = items[0].connectionId as string;
      console.log(`🔌 Using connectionId: ${connectionId}`);

      const domainName = event.requestContext?.domainName;
      const stage = event.requestContext?.stage;

      if (!domainName || !stage) {
        throw new Error("Missing requestContext domainName or stage");
      }
      
      try {
        // await apiGatewayManagementApi.send(postToConnectionCommand);
        // await apiGatewayManagementApi.send(postToConnectionCommand);
        await sendToConnection(event,connectionId,message,userId,"sendNotification");
        console.log("✅ Message sent successfully via WebSocket");

        await saveNotificationToDatabase(userId, message);

        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            delivery: "websocket_and_database",
          }),
        };
      } catch (wsError: any) {
        console.error("❌ WebSocket send error:", wsError);

        await saveNotificationToDatabase(userId, message);

        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            delivery: "database_only",
            error: wsError.message,
          }),
        };
      }
    } else {
      console.log("❌ No active connections found - saving to database only");
      await saveNotificationToDatabase(userId, message);

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, delivery: "database_only" }),
      };
    }
  } catch (err: any) {
    console.error("💥 Error in sendNotification handler:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal server error",
        details: err.message,
      }),
    };
  }
};

import cuid from "cuid";

async function saveNotificationToDatabase(userId: string, message: string) {
  console.log('💾 Attempting to save to PostgreSQL database...');
  console.log('📝 DATABASE_URL exists:', !!process.env.DATABASE_URL);
  
  const pgClient = new PgClient({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await pgClient.connect();
    console.log('✅ Connected to PostgreSQL');
    
    const id = cuid();
    const result = await pgClient.query(
      'INSERT INTO "Notification" ("id", "userId", "message", "isRead", "createdAt") VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, userId, message, false, new Date()]
    );
    
    console.log('✅ Notification saved to database:', JSON.stringify(result.rows[0], null, 2));
    console.log('📊 Rows affected:', result.rowCount);
    
  } catch (dbError) {
    console.error('💥 Database error:', dbError);
    console.error('🔍 Error details:', {
      // @ts-ignore
      name: dbError.name,
      // @ts-ignore

      message: dbError.message,
      // @ts-ignore

      stack: dbError.stack
    });
    throw dbError;
  } finally {
    try {
      await pgClient.end();
      console.log('🔌 PostgreSQL connection closed');
    } catch (closeError) {
      console.error('❌ Error closing PostgreSQL connection:', closeError);
    }
  }
}