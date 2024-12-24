const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("conversations-markAsRead", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "conversations/{conversationId}/read/{userId}",
  handler: async (request, context) => {
    try {
      await initializeCosmosDb();

      // Extract conversationId from route or fallback
      const conversationId = context.bindingData?.conversationId || request.url.split("/")[5];

      const userId = context.bindingData?.userId || request.url.split("/")[7];

      if (!conversationId) {
        return {
          status: 400,
          body: { message: "conversationId is required." },
        };
      }

      if (!userId) {
        return {
          status: 400,
          body: { message: "userId is required." },
        };
      }

      const container = getContainer();

      // Fetch the conversation document
      const { resource: conversation } = await container.item(conversationId).read();

      if (!conversation) {
        return {
          status: 404,
          body: { message: "Conversation not found." },
        };
      }

      // Ensure isReadByUser exists as an object
      conversation.isReadByUser = conversation.isReadByUser || {};

      // Mark the conversation as read for the user
      conversation.isReadByUser[userId] = true;

      // Update the conversation in the database
      await container.item(conversationId).replace(conversation);

      return { status: 200, body: { message: "Conversation marked as read." } };
    } catch (error) {
      context.log("Error marking conversation as read:", error.message);
      return {
        status: 500,
        body: { message: "Internal Server Error", details: error.message },
      };
    }
  },
});
