const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");
const { URL } = require("url");

app.http('users-getAllUsers', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'users',
    handler: async (request, context) => {
      await initializeCosmosDb();
  
      try {
        const container = getContainer();
        const querySpec = {
          query: `
            SELECT * 
            FROM c 
            WHERE c.type = 'user'
          `,
        };
  
        const { resources: users } = await container.items.query(querySpec).fetchAll();
  
        return {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(users),
        };
      } catch (error) {
        context.log('Error fetching all users:', error.message);
        return {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Internal Server Error' }),
        };
      }
    },
  });
  