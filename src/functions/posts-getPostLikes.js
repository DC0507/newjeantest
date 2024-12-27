const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("posts-getPostLikes", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "posts/{id}/likes",
  handler: async (request, context) => {
    await initializeCosmosDb();

    // Fallback to split logic if bindingData doesn't provide the postId
    let postId = context.bindingData?.id;
    if (!postId) {
      const urlParts = request.url.split("/");
      postId = urlParts[5]; // Adjust index based on URL structure
    }

    if (!postId) {
      return {
        status: 400,
        body: JSON.stringify({ error: "Post ID is required." }),
      };
    }

    try {
      const container = getContainer();

      // Fetch likes for the post
      const querySpec = {
        query: `
          SELECT c.likes
          FROM c
          WHERE c.type = 'post' AND c.id = @postId AND (IS_NULL(c.isDeleted) OR c.isDeleted = false)
        `,
        parameters: [{ name: "@postId", value: postId }],
      };

      const { resources: posts } = await container.items.query(querySpec).fetchAll();
      if (posts.length === 0) {
        return { status: 404, body: JSON.stringify({ error: "Post not found." }) };
      }

      const likes = posts[0].likes || [];

      return { 
        status: 200, 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(likes) 
      };
    } catch (error) {
      context.log("Error fetching likes for post:", error.message);
      return { status: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
  },
});
