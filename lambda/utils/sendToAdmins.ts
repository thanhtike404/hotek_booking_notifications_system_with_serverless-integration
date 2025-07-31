import { Client as PgClient } from "pg";
import { getConnectionsByUserId } from "./dynamoClient";
import { sendToConnection } from "./webSocket";
import { APIGatewayProxyEvent } from "aws-lambda";
import cuid from "cuid";

export async function sendToAdmins(message: string, event: APIGatewayProxyEvent) {
  const pgClient = new PgClient({
    connectionString: process.env.DATABASE_URL,
  });

  await pgClient.connect();
  console.log("🔍 Fetching admins from PostgreSQL...");

  const result = await pgClient.query(
    'SELECT id FROM "User" WHERE role = $1',
    ['ADMIN']
  );

  console.log(`📋 Found ${result.rowCount} admins.`);
  const admins = result.rows as { id: string }[];

  for (const admin of admins) {
    const connections = await getConnectionsByUserId(admin.id);

    // Save notification to database once per admin (regardless of connections)
    await saveNotificationToDatabase(admin.id, message);

    // Send WebSocket messages to all admin connections (if any)
    if (connections.length > 0) {
      for (const conn of connections) {
        try {
          await sendToConnection(event, conn.connectionId, message, admin.id, "sendNotification");
          console.log(`✅ Sent WebSocket message to admin ${admin.id} connection ${conn.connectionId}`);
        } catch (err) {
          console.error(`❌ Failed to send WebSocket to admin ${admin.id} connection ${conn.connectionId}:`, err);
        }
      }
    } else {
      console.log(`📭 No active connection for admin ${admin.id}, notification saved to DB only`);
    }
  }

  await pgClient.end();
  console.log("✅ Admin notifications sent and DB saved.");
}

async function saveNotificationToDatabase(userId: string, message: string) {
  const pgClient = new PgClient({ connectionString: process.env.DATABASE_URL });
  await pgClient.connect();

  const id = cuid();
  await pgClient.query(
    'INSERT INTO "Notification" ("id", "userId", "message", "isRead", "createdAt") VALUES ($1, $2, $3, $4, $5)',
    [id, userId, message, false, new Date()]
  );

  await pgClient.end();
}
