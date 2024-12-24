const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");
const { URL } = require("url");

app.http('users-getUserByEmail', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'users/email/{email}',
  handler: async (request, context) => {
    await initializeCosmosDb();

    let email = context.bindingData?.email;

    if (!email) {
      const parsedUrl = new URL(request.url);
      const pathSegments = parsedUrl.pathname.split('/');
      email = pathSegments.pop();
      context.log('Fallback Email:', email);
    }

    if (!email) {
      context.log.error('Email parameter is missing or undefined.');
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Email is required in the route.' }),
      };
    }

    try {
      const container = getContainer();
      const querySpec = {
        query: `
          SELECT * 
          FROM c 
          WHERE c.type = 'user' AND c.email = @email
        `,
        parameters: [{ name: '@email', value: email }],
      };

      const { resources: users } = await container.items.query(querySpec).fetchAll();
      if (users.length === 0) {
        context.log.info(`No user found with email: ${email}`);
        return {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'User with that email not found.' }),
        };
      }

      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(users[0]),
      };
    } catch (error) {
      context.log('Error fetching user by email:', error.message);
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Internal Server Error' }),
      };
    }
  },
});
