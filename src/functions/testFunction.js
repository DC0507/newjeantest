const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");
const querystring = require("querystring");

app.http("testFunction", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "test",
  handler: async (request, context) => {
    await initializeCosmosDb();
    const container = getContainer();

    const pageSize = parseInt(request.query.pageSize || "5");
    let rawContinuationToken = request.query.continuationToken || null;

    // Fallback to extracting from request.url if not in request.query
    if (!rawContinuationToken) {
      const urlParams = querystring.parse(request.url.split("?")[1]);
      rawContinuationToken = urlParams.continuationToken || null;
    }

    try {
      context.log(`Request ID: ${context.invocationId}`);
      context.log(`Raw query parameters: ${JSON.stringify(request.query)}`);
      context.log(`Request URL: ${request.url}`);
      context.log(`Raw continuationToken: ${rawContinuationToken}`);

      const queryOptions = {
        maxItemCount: pageSize,
        continuationToken: rawContinuationToken, // Pass as-is (already encoded)
        enableCrossPartitionQuery: true,
      };

      context.log(`Query options: ${JSON.stringify(queryOptions)}`);

      const query = {
        query: `SELECT * FROM c WHERE c.type = 'testData'`,
      };

      const { resources: items, continuationToken: nextToken } = await container.items
        .query(query, queryOptions)
        .fetchNext();

      context.log(`Response continuationToken: ${nextToken}`);
      context.log(`Items returned: ${items.length}`);

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          continuationToken: nextToken || null,
          hasMore: !!nextToken,
        }),
      };
    } catch (error) {
      context.log(`Error in testFunction: ${error.message}`);
      return { status: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
  },
});
