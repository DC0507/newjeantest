const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");
const querystring = require("querystring");

app.http("posts-getAllPosts", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "posts",
  handler: async (request, context) => {
    await initializeCosmosDb();
    const container = getContainer();

    const limit = parseInt(request.query.limit || "5");
    let rawContinuationToken = request.query.continuationToken || null;
    context.log('request.query: ', request.query);

    // Fallback to extracting continuationToken from URL if not in query params
    if (!rawContinuationToken) {
        // Ensure continuationToken is parsed reliably
      const urlParams = new URL(request.url, "http://localhost").searchParams;
      rawContinuationToken = rawContinuationToken || urlParams.get("continuationToken");

      context.log(`Parsed continuationToken: ${rawContinuationToken}`);
    }

    try {
      context.log(`Request ID: ${context.invocationId}`);
      context.log(`Request URL: ${request.url}`);
      context.log(`Raw continuationToken: ${rawContinuationToken}`);

      // Query for posts
      const querySpec = {
        query: `
          SELECT *
          FROM c
          WHERE c.type = 'post' AND (IS_NULL(c.isDeleted) OR c.isDeleted = false)
          ORDER BY c.timestamp DESC
        `,
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

      // Handle no posts
      if (enrichedPosts.length === 0) {
        return {
          status: 404,
          body: JSON.stringify({ error: "No more posts available." }),
        };
      }

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
      context.log("Error fetching posts:", error.message);
      return {
        status: 500,
        body: JSON.stringify({ error: "Internal Server Error" }),
      };
    }
  },
});
