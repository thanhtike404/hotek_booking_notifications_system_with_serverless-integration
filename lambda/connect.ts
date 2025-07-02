const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
import { APIGatewayProxyEvent } from "aws-lambda";

exports.handler = async function(event: APIGatewayProxyEvent): Promise<any> {
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);
    
    const userId = event.queryStringParameters?.userId;

    if (!userId) {
        return {
            statusCode: 400,
            body: "userId is required"
        };
    }

    const command = new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: {
           connectionId: event.requestContext.connectionId,
           userId: userId
        },
    });
    
    try {
      await docClient.send(command);
    } catch (err) {
        console.log(err);
        return {
          statusCode: 500
        };
    }
    
    return {
        statusCode: 200,
    };
};
