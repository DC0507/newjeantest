const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("conversations-getMessages", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "conversations/messages/{toUserId}/from/{fromUserId}",
  handler: async (request, context) => {
    try {
      await initializeCosmosDb();

      // Extract parameters
      const toUserId = context.bindingData?.toUserId || request.params?.toUserId || request.url.split("/")[4];
      const fromUserId = context.bindingData?.fromUserId || request.params?.fromUserId || request.url.split("/")[6]; // Fallback logic

      // Validate parameters
      if (!toUserId) {
        return {
          status: 400,
          body: { message: "toUserId route parameter is required." },
        };
      }

      if (!fromUserId) {
        return {
          status: 400,
          body: { message: "fromUserId query parameter is required." },
        };
      }

      const container = getContainer();

      // Query to fetch the conversation's messages
      const querySpec = {
        query: `
          SELECT c.messages
          FROM c
          WHERE c.type = "conversation"
            AND ((ARRAY_CONTAINS(c.messages, {"fromUserId": @fromUserId, "toUserId": @toUserId}, true)) 
              OR (ARRAY_CONTAINS(c.messages, {"fromUserId": @toUserId, "toUserId": @fromUserId}, true)))
            AND (IS_NULL(c.isDeleted) OR c.isDeleted = false)
        `,
        parameters: [
          { name: "@fromUserId", value: fromUserId },
          { name: "@toUserId", value: toUserId },
        ],
      };

      const { resources } = await container.items.query(querySpec).fetchAll();

      if (!resources.length) {
        return {
          status: 404,
          body: { message: "Conversation not found or no messages available." },
        };
      }

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resources[0].messages || []),
      };
    } catch (error) {
      context.log("Error fetching messages:", error.message);
      return {
        status: 500,
        body: { message: "Internal Server Error", details: error.message },
      };
    }
  },
});
