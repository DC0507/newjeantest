const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");
const { v4: uuidv4 } = require("uuid");

app.http("posts-createPost", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "posts",
  handler: async (request, context) => {
    await initializeCosmosDb();

    try {
      const body = await request.json();
      context.log('body: ', body);
      const { userId, goalId, description, imageUri, comments = [], likes = [], isUserPost } = body;

      if (!userId || !goalId || !description) {
        return {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Required fields: userId, goalId, and description." }),
        };
      }

      const post = {
        id: uuidv4(),
        type: "post",
        userId,
        goalId,
        description,
        imageUri,
        comments,
        likes,
        isUserPost,
        timestamp: Date.now(),
        isDeleted: false,
      };

      const container = getContainer();
      const { resource: createdPost } = await container.items.create(post);
      context.log('createdPost: ', createdPost);
      return { status: 201, body: JSON.stringify(createdPost) };
    } catch (error) {
      context.log("Error creating post:", error.message);
      return { status: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
  },
});
