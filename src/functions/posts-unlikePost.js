const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("posts-unlikePost", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "posts/{id}/unlike",
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
      const { userId } = await request.json();

      if (!userId) {
        return {
          status: 400,
          body: JSON.stringify({ error: "User ID is required." }),
        };
      }

      // Fetch the post using the partition key `/type`
      const querySpec = {
        query: `
          SELECT *
          FROM c
          WHERE c.type = 'post' AND c.id = @postId AND (IS_NULL(c.isDeleted) OR c.isDeleted = false)
        `,
        parameters: [{ name: "@postId", value: postId }],
      };

      const { resources: posts } = await container.items.query(querySpec).fetchAll();
      if (posts.length === 0) {
        return { status: 404, body: JSON.stringify({ error: "Post not found." }) };
      }

      const post = posts[0];

      // Remove like by userId
      post.likes = post.likes.filter((like) => like.id !== userId);

      // Update the post using the new partition key `/type`
      const { resource: updatedPost } = await container.item(post.id, post.type).replace(post);

      return { status: 200, body: JSON.stringify(updatedPost) };
    } catch (error) {
      context.log("Error unliking post:", error.message);
      return { status: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
  },
});
