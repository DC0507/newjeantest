const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("notifications-getUserNotifications", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "notifications/{userId}",
  handler: async (request, context) => {
    await initializeCosmosDb();

    // Use fallback split logic to extract userId
    const userId = context.bindingData?.userId || request.url.split("/")[5];

    if (!userId) {
      return {
        status: 400,
        body: JSON.stringify({ error: "User ID is required in the route." }),
      };
    }

    console.log('getUserNotifications userId: ', userId)

    try {
      const container = getContainer();

      // Query only for isRead and id fields
      const querySpec = {
        query: `
          SELECT c.id, c.isRead
          FROM c
          WHERE c.type = 'notification' AND c.toUserId = @userId
        `,
        parameters: [{ name: "@userId", value: userId }],
      };

      const { resources: notifications } = await container.items
        .query(querySpec)
        .fetchAll();

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notifications),
      };
    } catch (error) {
      context.log("Error fetching notifications:", error.message);
      return {
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Internal Server Error" }),
      };
    }
  },
});
