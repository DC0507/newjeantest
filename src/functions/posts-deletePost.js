const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("posts-deletePost", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "posts/delete/{id}",
  handler: async (request, context) => {
    await initializeCosmosDb();

    // Fallback to split logic if bindingData doesn't provide the ID
    let postId = context.bindingData?.id;
    if (!postId) {
      const urlParts = request.url.split("/");
      postId = urlParts[6]; // Adjust index if needed based on your URL structure
    }

    if (!postId) {
      return {
        status: 400,
        body: JSON.stringify({ error: "Post ID is required." }),
      };
    }

    try {
      const container = getContainer();

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

      // Mark post as deleted
      post.isDeleted = true;

      // Update post using the partition key `/type`
      const { resource: updatedPost } = await container.item(post.id, post.type).replace(post);

      return {
        status: 200,
        body: JSON.stringify({ message: "Post marked as deleted", post: updatedPost }),
      };
    } catch (error) {
      context.log("Error deleting post:", error.message);
      return { status: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
  },
});
