import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient
} from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Client as PgClient } from "pg";
import { getConnectionsByUserId } from "./utils/dynamoClient";
import { sendToConnection } from "./utils/webSocket";
import { sendToAdmins } from "./utils/sendToAdmins";
import cuid from "cuid";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

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

    // WebSocket domain info
    const domainName = event.requestContext?.domainName;
    const stage = event.requestContext?.stage;

    if (!domainName || !stage) {
      throw new Error("Missing requestContext domainName or stage");
    }

    const connections = await getConnectionsByUserId(userId);

    const pgClient = new PgClient({
      connectionString: process.env.DATABASE_URL,
    });

    await pgClient.connect();

    try {
      // 1. Try WebSocket if there’s an active connection
      if (connections && connections.length > 0) {
        const connectionId = connections[0].connectionId as string;
        console.log(`🔌 Sending WS message to user connection: ${connectionId}`);
        await sendToConnection(event, connectionId, message, userId, "sendNotification");
      } else {
        console.log("❌ No active user WebSocket connections found");
      }

      // 2. Send message to all admin users
      await sendToAdmins(message, event);

      // 3. Save notifications to DB for all admin users
      const result = await pgClient.query(
        `SELECT id FROM "User" WHERE role = 'ADMIN'`
      );

      const adminUsers = result.rows as { id: string }[];

      for (const admin of adminUsers) {
        await saveNotificationToDatabase(pgClient, admin.id, message);
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          delivery: "websocket_and_database",
        }),
      };
    } catch (wsError: any) {
      console.error("❌ Error during WebSocket or DB flow:", wsError);

      // fallback to save notification for original user only
      await saveNotificationToDatabase(pgClient, userId, message);

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          delivery: "database_only",
          error: wsError.message,
        }),
      };
    } finally {
      await pgClient.end();
      console.log("🔌 PostgreSQL connection closed");
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

async function saveNotificationToDatabase(
  pgClient: PgClient,
  userId: string,
  message: string
) {
  console.log(`💾 Saving notification for userId: ${userId}`);

  const id = cuid();
  const result = await pgClient.query(
    'INSERT INTO "Notification" ("id", "userId", "message", "isRead", "createdAt") VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [id, userId, message, false, new Date()]
  );

  console.log("✅ Notification saved:", JSON.stringify(result.rows[0], null, 2));
}
