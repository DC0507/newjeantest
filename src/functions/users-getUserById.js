const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");
const { URL } = require("url");

app.http('users-getUserById', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'users/{userId}',
    handler: async (request, context) => {
      await initializeCosmosDb();
  
      let userId = context.bindingData?.userId;
  
      if (!userId) {
        const parsedUrl = new URL(request.url);
        const pathSegments = parsedUrl.pathname.split('/');
        userId = pathSegments.pop();
        context.log('Fallback UserId:', userId);
      }
  
      if (!userId) {
        context.log.error('UserId parameter is missing or undefined.');
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'UserId is required in the route.' }),
        };
      }
  
      try {
        const container = getContainer();
        const querySpec = {
          query: `
            SELECT * 
            FROM c 
            WHERE c.type = 'user' AND c.id = @userId
          `,
          parameters: [{ name: '@userId', value: userId }],
        };
  
        const { resources: users } = await container.items.query(querySpec).fetchAll();
        if (users.length === 0) {
          context.log.info(`No user found with userId: ${userId}`);
          return {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'User not found.' }),
          };
        }
  
        return {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(users[0]),
        };
      } catch (error) {
        context.log('Error fetching user by userId:', error.message);
        return {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Internal Server Error' }),
        };
      }
    },
  });
  