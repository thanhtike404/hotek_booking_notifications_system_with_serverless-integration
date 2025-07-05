import {
    ApiGatewayManagementApiClient,
    PostToConnectionCommand,
  } from "@aws-sdk/client-apigatewaymanagementapi";
  import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
 export const sendToConnection=(event: APIGatewayProxyEvent,connectionId:string,message:string,userId:string,action:string) =>{
      if (!event.requestContext?.domainName || !event.requestContext?.stage) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Missing requestContext domainName or stage" }),
        };
      }
        const payload = {

          action: action,
          message,
          userId,
          timestamp: new Date().toISOString(),
        };

        const postToConnectionCommand = new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: JSON.stringify(payload),
        });

        const apiGatewayManagementApi = new ApiGatewayManagementApiClient({
          endpoint: `https://${event.requestContext?.domainName}/${event.requestContext?.stage}`,
        });


        return apiGatewayManagementApi.send(postToConnectionCommand)
      };
