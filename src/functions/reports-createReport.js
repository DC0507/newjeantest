const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");
const { v4: uuidv4 } = require("uuid");

app.http('reports-createReport', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'reports',
  handler: async (request, context) => {
    await initializeCosmosDb();

    try {
      const body = await request.json(); // Parse JSON body
      const { reporterId, reportedUserId, reportedEntityId, reportedEntityType, reason } = body;

      if (!reporterId || !reportedUserId || !reportedEntityId || !reportedEntityType || !reason) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'All fields are required.' }),
        };
      }

      const report = {
        id: uuidv4(),
        reporterId,
        reportedUserId,
        reportedEntityId,
        reportedEntityType,
        reason,
        timestamp: Date.now(),
        status: "pending", // Default status
        type: "report",    // Partition key
      };

      const container = getContainer();
      const { resource: createdReport } = await container.items.create(report);

      return {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createdReport),
      };
    } catch (error) {
      context.log('Error creating report:', error.message);
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Internal Server Error' }),
      };
    }
  },
});
