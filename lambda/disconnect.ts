const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
import { APIGatewayProxyEvent } from "aws-lambda";
exports.handler = async function(event: APIGatewayProxyEvent): Promise<any> {
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);
    
    const command = new DeleteCommand({
        TableName: process.env.TABLE_NAME,
        Key: {
           connectionId: event.requestContext.connectionId,
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
