const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");
const querystring = require("querystring");

app.http("posts-getPostsForUser", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "posts/user/{userId}",
  handler: async (request, context) => {
    await initializeCosmosDb();
    const container = getContainer();

    // Extract userId from the URL or fallback
    let userId = context.bindingData?.userId;
    if (!userId) {
      const urlParts = request.url.split('/');
      userId = urlParts[urlParts.length - 1].split('?')[0];
    }

    context.log('getPOstsForUser userId: ', userId);

    const limit = parseInt(request.query.limit || "5");
    let rawContinuationToken = request.query.continuationToken || null;

    // Fallback to extracting continuationToken from URL if not in query params
    if (!rawContinuationToken) {
      const urlParams = querystring.parse(request.url.split("?")[1]);
      rawContinuationToken = urlParams.continuationToken || null;
    }

    if (!userId) {
      return {
        status: 400,
        body: JSON.stringify({ error: "User ID is required." }),
      };
    }

    try {
      const querySpec = {
        query: `
          SELECT *
          FROM c
          WHERE c.type = 'post' AND c.userId = @userId AND (IS_NULL(c.isDeleted) OR c.isDeleted = false)
          ORDER BY c.timestamp DESC
        `,
        parameters: [{ name: "@userId", value: userId }],
      };

      const queryOptions = {
        maxItemCount: limit,
        continuationToken: rawContinuationToken,
        enableCrossPartitionQuery: true,
      };

      const { resources: posts, continuationToken: nextToken } = await container.items
        .query(querySpec, queryOptions)
        .fetchNext();

      // Enrich posts with related data
      const enrichedPosts = await Promise.all(
        posts.map(async (post) => {
          const userQuery = {
            query: `
              SELECT c.name, c.username, c.userImageUri
              FROM c
              WHERE c.type = 'user' AND c.id = @userId
            `,
            parameters: [{ name: "@userId", value: post.userId }],
          };

          const goalQuery = {
            query: `
              SELECT c.goalName, c.completionStreak
              FROM c
              WHERE c.type = 'goal' AND c.id = @goalId
            `,
            parameters: [{ name: "@goalId", value: post.goalId }],
          };

          const [userResult, goalResult] = await Promise.all([
            container.items.query(userQuery).fetchAll(),
            container.items.query(goalQuery).fetchAll(),
          ]);

          const user = userResult.resources[0] || {};
          const goal = goalResult.resources[0] || {};
          const likeCount = (post.likes || []).length;

          return {
            ...post,
            name: user.name || "Unknown",
            username: user.username || "Unknown",
            userImageUri: user.userImageUri || "",
            goalName: goal.goalName || "Unknown",
            completionStreak: goal.completionStreak || 0,
            likeCount,
          };
        })
      );

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posts: enrichedPosts,
          continuationToken: nextToken || null,
          hasMore: !!nextToken,
        }),
      };
    } catch (error) {
      context.log("Error fetching user's posts:", error.message);
      return {
        status: 500,
        body: JSON.stringify({ error: "Internal Server Error" }),
      };
    }
  },
});
