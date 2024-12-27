const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");
const { v4: uuidv4 } = require("uuid");

app.http("notifications-addNotification", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "notifications",
  handler: async (request, context) => {
    await initializeCosmosDb();

    try {
      const newNotification = {
        ...await request.json(),
        type: "notification",
        id: uuidv4(),
        timestamp: Date.now(),
        isRead: false,
      };

      const container = getContainer();

      const { resource: createdNotification } = await container.items.create(newNotification);

      return {
        status: 201,
        body: JSON.stringify({
          message: "Notification added successfully",
          createdNotification,
        }),
      };
    } catch (error) {
      context.log("Error adding notification:", error.message);
      return { status: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
  },
});
