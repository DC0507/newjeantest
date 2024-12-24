const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("posts-likePost", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "posts/{id}/like",
  handler: async (request, context) => {
    await initializeCosmosDb();

    // Extract the postId from the request
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
      const body = await request.json();

      // Fetch the post using the new partition key (type = 'post')
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

      // Add like to the post
      post.likes = post.likes || []; // Ensure the likes array exists
      post.likes.push(body);

      // Log the post update attempt
      context.log(`Updating post with id: ${post.id}, partitionKey: ${post.type}`);

      // Update the post document
      const { resource: updatedPost } = await container.item(post.id, post.type).replace(post);

      return { status: 200, body: JSON.stringify(updatedPost) };
    } catch (error) {
      // Log detailed error message
      context.log("Error liking post:", error.message);
      return { status: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
  },
});
