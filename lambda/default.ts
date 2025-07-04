// default.handler - Add this to debug routing issues
export const handler = async (event: any): Promise<any> => {
  console.log('=== DEFAULT HANDLER CALLED ===');
  console.log('This means the route was not matched properly');
  console.log('Full event:', JSON.stringify(event, null, 2));
  
  let body;
  try {
    if (typeof event.body === 'string') {
      body = JSON.parse(event.body);
    } else {
      body = event.body;
    }
    console.log('Parsed body:', JSON.stringify(body, null, 2));
    
    // Check if this was meant to be a sendNotification call
    if (body && body.action === 'sendNotification') {
      console.log('⚠️  This should have been routed to sendNotification handler!');
      console.log('⚠️  Check your WebSocket API route configuration');
      
      // You could even call the sendNotification logic here as a fallback
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          message: 'Received in default handler - check routing',
          action: body.action,
          routeKey: event.requestContext?.routeKey
        })
      };
    }
    
  } catch (parseError) {
    console.log('Error parsing body:', parseError);
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Default handler response' })
  };
};