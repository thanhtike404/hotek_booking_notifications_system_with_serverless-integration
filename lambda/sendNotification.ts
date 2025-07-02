import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Welcome to the WebSocket API!",
      connectionId: event.requestContext.connectionId,
      requestContext: event.requestContext,
    }),
  };
}