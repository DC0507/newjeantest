const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("notifications-markAsRead", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "notifications/{id}/read",
  handler: async (request, context) => {
    await initializeCosmosDb();

    // Use fallback split logic to extract notificationId
    const notificationId = context.bindingData?.id || request.url.split("/")[5];

    if (!notificationId) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Notification ID is required in the route." }),
      };
    }

    try {
      const container = getContainer();

      // Read the existing notification
      const { resource: existingNotification } = await container.item(notificationId).read();

      if (!existingNotification) {
        return {
          status: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Notification not found." }),
        };
      }

      // Update the `isRead` field
      existingNotification.isRead = true;

      const { resource: updatedNotification } = await container
        .item(notificationId, existingNotification.type) // Use correct partition key
        .replace(existingNotification);

        context.log('updatedNotification: ', updatedNotification);

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedNotification),
      };
    } catch (error) {
      context.log("Error marking notification as read:", error.message);
      return {
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Internal Server Error" }),
      };
    }
  },
});
