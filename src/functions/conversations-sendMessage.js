const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");
const { v4: uuidv4 } = require("uuid");

app.http("conversations-sendMessage", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "conversations/messages/{conversationId}",
  handler: async (request, context) => {
    await initializeCosmosDb();
    const { fromUserId, toUserId, content } = await request.json();

    const conversationId = context.bindingData?.conversationId || request.params?.conversationId || request.url.split("/")[4];

    if (!conversationId || !fromUserId || !toUserId || !content) {
      return {
        status: 400,
        body: { message: "All fields are required: conversationId, fromUserId, toUserId, content." },
      };
    }

    const newMessage = {
      id: uuidv4(),
      fromUserId,
      toUserId,
      content,
      timestamp: Date.now(),
    };

    try {
      const container = getContainer();

      // Fetch the conversation by conversationId
      const { resource: conversation } = await container.item(conversationId).read();

      if (!conversation) {
        return {
          status: 404,
          body: { message: "Conversation not found." },
        };
      }

      // Update the existing conversation
      conversation.messages = [...(conversation.messages || []), newMessage];
      conversation.lastMessage = newMessage;
      conversation.isReadByUser = { ...conversation.isReadByUser, [toUserId]: false };

      await container.item(conversationId).replace(conversation);

      return { status: 200, body: JSON.stringify(newMessage) };
    } catch (error) {
      context.log("Error updating conversation:", error.message);
      return {
        status: 500,
        body: { message: "Internal Server Error", details: error.message },
      };
    }
  },
});
