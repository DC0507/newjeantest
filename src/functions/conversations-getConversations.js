const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("conversations-getConversations", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "conversations/{userId}",
  handler: async (request, context) => {
    try {
      await initializeCosmosDb();

      let userId = context.bindingData?.userId || request.url.split("/").pop();

      if (!userId) {
        return { status: 400, body: { message: "userId route parameter is required." } };
      }

      const container = getContainer();

      // Query to fetch conversations
      const conversationsQuery = {
        query: `
          SELECT 
              c.id AS conversationId,
              c.lastMessage,
              c.isReadByUser[@userId] AS isRead
          FROM c
          WHERE c.type = "conversation"
            AND (IS_NULL(c.isDeleted) OR c.isDeleted = false)
            AND (
              c.lastMessage.fromUserId = @userId 
              OR c.lastMessage.toUserId = @userId
            )
        `,
        parameters: [{ name: "@userId", value: userId }],
      };

      const { resources: conversations } = await container.items.query(conversationsQuery).fetchAll();

      if (!conversations || conversations.length === 0) {
        return { status: 200, headers: { "Content-Type": "application/json" }, body: [] };
      }

      // Process valid conversations (as in your original code)
      const validConversations = conversations.filter((conv) => conv.lastMessage);
      const userIds = [...new Set(validConversations.map((conv) =>
        conv.lastMessage.fromUserId === userId
          ? conv.lastMessage.toUserId
          : conv.lastMessage.fromUserId
      ))];

      // Fetch user details
      const userQuery = {
        query: `
          SELECT c.id AS userId, c.username, c.name, c.userImageUri
          FROM c
          WHERE c.type = "user" AND c.id IN (${userIds.map((_, i) => `@userId${i}`).join(", ")})
        `,
        parameters: userIds.map((id, i) => ({ name: `@userId${i}`, value: id })),
      };

      const { resources: users } = await container.items.query(userQuery).fetchAll();
      const userMap = users.reduce((map, user) => {
        map[user.userId] = {
          userId: user.userId,
          username: user.username,
          name: user.name,
          userImageUri: user.userImageUri,
        };
        return map;
      }, {});

      const enrichedConversations = validConversations.map((conv) => {
        const otherUserId = conv.lastMessage.fromUserId === userId
          ? conv.lastMessage.toUserId
          : conv.lastMessage.fromUserId;

        const userDetails = userMap[otherUserId] || {};
        return {
          conversationId: conv.conversationId,
          lastMessage: conv.lastMessage,
          isRead: conv.isRead,
          username: userDetails.username || otherUserId,
          name: userDetails.name || otherUserId,
          userImageUri: userDetails.userImageUri || null,
          toUserId: userDetails.userId,
        };
      });

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(enrichedConversations),
      };
    } catch (error) {
      context.log("Error fetching conversations:", error.message, error.stack);
      return {
        status: 500,
        body: {
          message: "Internal Server Error",
          details: error.message,
          stack: error.stack,
        },
      };
    }
  },
});
