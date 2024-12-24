const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http('reports-getAllReports', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'reports',
    handler: async (request, context) => {
      await initializeCosmosDb();
  
      const queryParams = new URL(request.url).searchParams;
      const status = queryParams.get('status'); // Get optional 'status' query param
  
      try {
        const container = getContainer();
        const querySpec = {
          query: `
            SELECT *
            FROM c
            WHERE c.type = 'report'
            ${status ? "AND c.status = @status" : ""}
          `,
          parameters: status ? [{ name: "@status", value: status }] : [],
        };
  
        const { resources: reports } = await container.items.query(querySpec).fetchAll();
  
        return {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reports),
        };
      } catch (error) {
        context.log('Error fetching reports:', error.message);
        return {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Internal Server Error' }),
        };
      }
    },
  });
  