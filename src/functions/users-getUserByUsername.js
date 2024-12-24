const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");
const { URL } = require("url");

app.http('users-getUserByUsername', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'users/username/{username}',
  handler: async (request, context) => {
    await initializeCosmosDb();

    let username = context.bindingData?.username;

    if (!username) {
      const parsedUrl = new URL(request.url);
      const pathSegments = parsedUrl.pathname.split('/');
      username = pathSegments.pop();
      context.log('Fallback Username:', username);
    }

    if (!username) {
      context.log.error('Username parameter is missing or undefined.');
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Username is required in the route.' }),
      };
    }

    try {
      const container = getContainer();
      const querySpec = {
        query: `
          SELECT * 
          FROM c 
          WHERE c.type = 'user' AND c.username = @username
        `,
        parameters: [{ name: '@username', value: username }],
      };

      const { resources: users } = await container.items.query(querySpec).fetchAll();
      if (users.length === 0) {
        context.log.info(`No user found with username: ${username}`);
        return {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'User with that username not found.' }),
        };
      }

      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(users[0]), // Serialize the user object
      };
    } catch (error) {
      context.log('Error fetching user by username:', error.message);
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Internal Server Error' }),
      };
    }
  },
});
