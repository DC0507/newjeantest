const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("conversations-softDelete", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "conversations/{conversationId}/delete",
  handler: async (request, context) => {
    // Ensure Cosmos DB is initialized
    await initializeCosmosDb();

    // Retrieve conversationId from the route or fallback logic
    let conversationId = context.bindingData?.conversationId;
    if (!conversationId) {
      const routeParts = request.url.split("/");
      conversationId = routeParts[routeParts.indexOf("conversations") + 1];
    }

    if (!conversationId) {
      return {
        status: 400,
        body: { error: "Conversation ID is required in the route." },
      };
    }

    try {
      const container = getContainer();

      // Query to fetch all messages in the conversation
      const querySpec = {
        query: `
          SELECT *
          FROM c
          WHERE c.type = 'message'
            AND c.conversationId = @conversationId
            AND (IS_NULL(c.isDeleted) OR c.isDeleted = false)
        `,
        parameters: [{ name: "@conversationId", value: conversationId }],
      };

      const { resources: messages } = await container.items.query(querySpec).fetchAll();

      // Mark all messages in the conversation as deleted
      for (const message of messages) {
        message.isDeleted = true;
        await container.item(message.id).replace(message);
      }

      return {
        status: 200,
        body: { message: "Conversation marked as deleted." },
      };
    } catch (error) {
      context.log("Error deleting conversation:", error.message);
      return {
        status: 500,
        body: { message: "Internal Server Error" },
      };
    }
  },
});
