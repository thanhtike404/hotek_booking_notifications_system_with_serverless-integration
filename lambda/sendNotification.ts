import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Client as PgClient } from "pg";
import { getConnectionsByUserId } from "./utils/dynamoClient";
import { sendToConnection } from "./utils/webSocket";
import { sendToAdmins } from "./utils/sendToAdmins";

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
      // 1. Attempt to send WebSocket notifications (best-effort)
      try {
        // a. Send to the original user if connected
        if (connections && connections.length > 0) {
          for (const connection of connections) {
            const connectionId = connection.connectionId as string;
            console.log(
              `🔌 Sending WS message to user connection: ${connectionId}`
            );
            await sendToConnection(
              event,
              connectionId,
              message,
              userId,
              "sendNotification"
            );
          }
        } else {
          console.log(`❌ No active user WebSocket connections found for ${userId}`);
        }

        // b. Send message to all admin users (this will handle DB saving)
        await sendToAdmins(message, event);
      } catch (wsError: any) {
        console.error(
          "❌ Error during WebSocket delivery:",
          wsError
        );
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          delivery: "database_and_websocket_attempt",
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


